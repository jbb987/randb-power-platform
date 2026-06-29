"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAssignmentEmail = sendAssignmentEmail;
const v2_1 = require("firebase-functions/v2");
/**
 * Sends transactional notification email via the Resend HTTP API.
 * Node 22 provides a global `fetch`, so no SDK dependency is needed.
 *
 * Requires:
 *  - RESEND_API_KEY secret (firebase functions:secrets:set RESEND_API_KEY)
 *  - a verified sending domain in Resend matching FROM_ADDRESS below.
 */
const FROM_ADDRESS = 'R&B Power <notifications@randbpowerinc.us>';
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
async function sendAssignmentEmail(args) {
    if (!args.apiKey) {
        v2_1.logger.warn('[notifications] RESEND_API_KEY not set; skipping email');
        return;
    }
    if (!args.to) {
        v2_1.logger.warn('[notifications] no recipient email; skipping email');
        return;
    }
    const subject = `${args.actorName} assigned you a task`;
    const safeTitle = escapeHtml(args.taskTitle);
    const safeActor = escapeHtml(args.actorName);
    const safeName = escapeHtml(args.recipientName);
    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#201F1E">
      <p style="font-size:15px">Hi ${safeName},</p>
      <p style="font-size:15px"><strong>${safeActor}</strong> assigned you a task:</p>
      <p style="font-size:16px;font-weight:bold;padding:12px 16px;background:#F5F4F2;border-radius:8px">
        ${safeTitle}
      </p>
      <p style="margin:24px 0">
        <a href="${args.url}"
           style="display:inline-block;background:#ED202B;color:#fff;text-decoration:none;
                  padding:10px 20px;border-radius:8px;font-size:15px;font-weight:bold">
          Open To&nbsp;Do List
        </a>
      </p>
      <p style="font-size:12px;color:#7A756E">R&amp;B Power Platform notification</p>
    </div>
  `;
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${args.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: FROM_ADDRESS,
                to: [args.to],
                subject,
                html,
            }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            v2_1.logger.error('[notifications] Resend send failed', { status: res.status, body });
        }
    }
    catch (err) {
        v2_1.logger.error('[notifications] Resend send threw', { err });
    }
}
//# sourceMappingURL=email.js.map