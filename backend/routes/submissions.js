const express = require('express');
const supabase = require('../supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);
const VALID_STATUSES = ['submitted', 'in_review', 'revision_requested', 'approved'];
function cleanOptionalUrl(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 500) throw new Error(`${label} must be a URL under 500 characters.`);
  let parsed; try { parsed = new URL(value); } catch { throw new Error(`${label} must be a valid URL.`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${label} must start with http:// or https://.`);
  return parsed.toString();
}
function validateProject(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (title.length < 3 || title.length > 120) throw new Error('Project title must be between 3 and 120 characters.');
  if (description.length < 20 || description.length > 5000) throw new Error('Description must be between 20 and 5000 characters.');
  return { title, description, github_url: cleanOptionalUrl(body.github_url, 'GitHub URL'), demo_url: cleanOptionalUrl(body.demo_url, 'Demo URL') };
}
async function listForStudent(userId) {
  const { data, error } = await supabase.from('project_submissions').select('id,student_id,title,description,github_url,demo_url,status,created_at,updated_at').eq('student_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return attachReviews(data || [], false);
}
async function attachReviews(items, includeStudent) {
  if (!items.length) return [];
  const ids = items.map(item => item.id);
  const { data: reviews, error: reviewError } = await supabase.from('project_reviews').select('id,submission_id,mentor_id,rating,feedback,created_at,updated_at').in('submission_id', ids);
  if (reviewError) throw reviewError;
  const reviewMap = new Map((reviews || []).map(review => [review.submission_id, review]));
  let names = new Map();
  if (includeStudent) {
    const studentIds = [...new Set(items.map(item => item.student_id))];
    const { data: students, error: studentError } = await supabase.from('app_users').select('id,name,email').in('id', studentIds);
    if (studentError) throw studentError;
    names = new Map((students || []).map(student => [student.id, student]));
  }
  return items.map(item => ({ ...item, review: reviewMap.has(item.id) ? reviewMap.get(item.id) : null, ...(includeStudent ? { student: names.get(item.student_id) || { name: 'Student', email: '' } } : {}) }));
}
router.get('/', async (req, res, next) => {
  try {
    if (req.user.role === 'mentor') {
      const { data, error } = await supabase.from('project_submissions').select('id,student_id,title,description,github_url,demo_url,status,created_at,updated_at').order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ submissions: await attachReviews(data || [], true) });
    }
    return res.json({ submissions: await listForStudent(req.user.id) });
  } catch (error) { next(error); }
});
router.post('/', requireRole('student'), async (req, res, next) => {
  try {
    const project = validateProject(req.body);
    const { data, error } = await supabase.from('project_submissions').insert({ ...project, student_id: req.user.id, status: 'submitted' }).select('id,student_id,title,description,github_url,demo_url,status,created_at,updated_at').single();
    if (error) throw error;
    return res.status(201).json({ submission: { ...data, review: null } });
  } catch (error) { if (error.message && /must be|valid URL|characters/.test(error.message)) return res.status(400).json({ error: error.message }); next(error); }
});
router.patch('/:id', requireRole('student'), async (req, res, next) => {
  try {
    const project = validateProject(req.body);
    const { data: current, error: currentError } = await supabase.from('project_submissions').select('id,status').eq('id', req.params.id).eq('student_id', req.user.id).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return res.status(404).json({ error: 'Submission not found.' });
    if (!['submitted', 'revision_requested'].includes(current.status)) return res.status(409).json({ error: 'Only submitted projects or projects needing revision can be edited.' });
    const { data, error } = await supabase.from('project_submissions').update({ ...project, status: 'submitted' }).eq('id', current.id).eq('student_id', req.user.id).select('id,student_id,title,description,github_url,demo_url,status,created_at,updated_at').single();
    if (error) throw error;
    return res.json({ submission: data });
  } catch (error) { if (error.message && /must be|valid URL|characters/.test(error.message)) return res.status(400).json({ error: error.message }); next(error); }
});
router.delete('/:id', requireRole('student'), async (req, res, next) => {
  try {
    const { data: current, error: currentError } = await supabase.from('project_submissions').select('id,status').eq('id', req.params.id).eq('student_id', req.user.id).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return res.status(404).json({ error: 'Submission not found.' });
    if (!['submitted', 'revision_requested'].includes(current.status)) return res.status(409).json({ error: 'Only submitted projects or projects needing revision can be deleted.' });
    const { error } = await supabase.from('project_submissions').delete().eq('id', current.id).eq('student_id', req.user.id);
    if (error) throw error;
    return res.json({ message: 'Submission deleted.' });
  } catch (error) { next(error); }
});
router.post('/:id/review', requireRole('mentor'), async (req, res, next) => {
  try {
    const { status, rating, feedback } = req.body;
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Choose a valid review status.' });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5.' });
    if (typeof feedback !== 'string' || feedback.trim().length < 5 || feedback.trim().length > 3000) return res.status(400).json({ error: 'Feedback must be between 5 and 3000 characters.' });
    const { data: submission, error: findError } = await supabase.from('project_submissions').select('id').eq('id', req.params.id).maybeSingle();
    if (findError) throw findError;
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });
    const { error: saveError } = await supabase.rpc('save_project_review', {
      p_submission_id: submission.id,
      p_mentor_id: req.user.id,
      p_status: status,
      p_rating: rating,
      p_feedback: feedback.trim()
    });
    if (saveError) throw saveError;
    const { data: updated, error: updateError } = await supabase.from('project_submissions').select('id,status').eq('id', submission.id).single();
    if (updateError) throw updateError;
    const { data: review, error: reviewError } = await supabase.from('project_reviews').select('id,submission_id,mentor_id,rating,feedback,created_at,updated_at').eq('submission_id', submission.id).single();
    if (reviewError) throw reviewError;
    return res.json({ message: 'Review saved.', submission: updated, review });
  } catch (error) { next(error); }
});
module.exports = router;
