'use strict';

// TEMPORARY one-off endpoint: creates the daycare CPR pitch Outlook draft.
// Delete after use. Auth: ?secret=<DEPLOY_SECRET>

const { createOutlookDraft, LINDSAY } = require('../lib/outlook-draft');

const SECRET = process.env.DRAFT_SECRET || 'daycare-pitch-2026';

function pitchHtml() {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Georgia,serif;background:#f7f5f0;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;">
<div style="background:#1E3161;padding:32px 40px;text-align:center;">
<div style="color:#ffffff;font-size:26px;font-weight:bold;letter-spacing:1px;">Mindful Beginnings</div>
<div style="color:#C7A24A;font-size:14px;margin-top:6px;letter-spacing:2px;">CPR CERTIFICATION THAT COMES TO YOU</div>
</div>
<div style="height:4px;background:#C7A24A;"></div>
<div style="padding:36px 40px;color:#333333;font-size:16px;line-height:1.7;">
<p>Hi there,</p>
<p>I'm <strong>Lindsay Karr</strong>, founder of Mindful Beginnings. We provide American Red Cross CPR certification, and we come directly to you.</p>
<p>If your staff needs their <strong>Adult and Pediatric First Aid/CPR/AED</strong> certification, we make it easy:</p>
<div style="background:#f7f5f0;border-left:4px solid #C7A24A;padding:16px 20px;margin:24px 0;">
<p style="margin:0 0 10px 0;"><strong style="color:#1E3161;">Hybrid format that respects their time.</strong><br>Staff complete about 2 hours online at home, at their own pace. Then we come to your school for a 2-hour hands-on skills session and testing. That\'s it.</p>
</div>
<div style="background:#f7f5f0;border-left:4px solid #C7A24A;padding:16px 20px;margin:24px 0;">
<p style="margin:0 0 10px 0;"><strong style="color:#1E3161;">We work around your calendar.</strong><br>Professional development days are perfect, but we\'ll come any day, anytime that works for you. We bring all the equipment.</p>
</div>
<div style="background:#f7f5f0;border-left:4px solid #C7A24A;padding:16px 20px;margin:24px 0;">
<p style="margin:0;"><strong style="color:#1E3161;">Real Red Cross certification.</strong><br>This isn\'t a watered-down training. Your staff earns a 2-year American Red Cross certification in Adult and Pediatric First Aid/CPR/AED.</p>
</div>
<p style="text-align:center;margin:32px 0;">
<a href="mailto:lindsay@mindfulbeginnings.org?subject=Group%20CPR%20pricing" style="display:inline-block;background:#1E3161;color:#ffffff;text-decoration:none;padding:14px 36px;font-size:16px;border-radius:4px;">Reply for Custom Group Pricing</a>
</p>
<p>Warmly,<br><strong>Lindsay Karr, M.Ed.</strong><br>Founder, Mindful Beginnings<br>703-987-5979<br><a href="https://mindfulbeginnings.org" style="color:#1E3161;">mindfulbeginnings.org</a></p>
</div>
<div style="background:#1E3161;padding:20px;text-align:center;color:#ffffff;font-size:12px;">
Mindful Beginnings &bull; Serving the DC Metro Area
</div>
</div>
</body></html>`;
}

module.exports = async (req, res) => {
  if (req.query.secret !== SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const result = await createOutlookDraft({
      to: LINDSAY,
      subject: 'CPR certification for your staff, at your school, on your schedule',
      htmlBody: pitchHtml()
    });
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
