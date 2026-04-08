import nodemailer from "nodemailer";

// Email configuration from environment variables
const EMAIL_HOST = process.env.EMAIL_HOST || "smtp.gmail.com";
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || "587");
const EMAIL_USER = process.env.EMAIL_USER || "";
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@dermacloud.in";

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: EMAIL_PORT === 465, // true for 465, false for other ports
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASSWORD,
  },
});

/**
 * Send OTP email to user
 */
export async function sendOTPEmail(email: string, otp: string): Promise<void> {
  const mailOptions = {
    from: `"DermaCloud" <${EMAIL_FROM}>`,
    to: email,
    subject: "Your OTP for DermaCloud Signup",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f9f9f9;
            }
            .header {
              background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: white;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .otp-box {
              background: #f0fdfa;
              border: 2px dashed #0d9488;
              padding: 20px;
              text-align: center;
              margin: 20px 0;
              border-radius: 8px;
            }
            .otp-code {
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 8px;
              color: #0d9488;
            }
            .footer {
              text-align: center;
              color: #666;
              font-size: 12px;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>DermaCloud</h1>
              <p>AI-Powered Dermatology Platform</p>
            </div>
            <div class="content">
              <h2>Verify Your Email</h2>
              <p>Thank you for signing up with DermaCloud!</p>
              <p>Please use the following OTP to complete your registration:</p>

              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>

              <p><strong>This OTP is valid for 10 minutes.</strong></p>
              <p>If you didn't request this OTP, please ignore this email.</p>

              <p>Best regards,<br>The DermaCloud Team</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 DermaCloud. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("OTP email sent successfully to:", email);
  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw new Error("Failed to send OTP email");
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, name: string, resetUrl: string): Promise<void> {
  const mailOptions = {
    from: `"DermaCloud" <${EMAIL_FROM}>`,
    to: email,
    subject: "Reset Your DermaCloud Password",
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background-color: #f1f5f9; color: #334155; }
            .wrapper { max-width: 600px; margin: 40px auto; padding: 0 16px 40px; }
            .card { background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
            .header { background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); padding: 36px 40px; text-align: center; }
            .logo-icon { width: 52px; height: 52px; background: rgba(255,255,255,0.2); border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; }
            .header h1 { color: #ffffff; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
            .header p { color: rgba(255,255,255,0.8); font-size: 14px; margin-top: 4px; }
            .body { padding: 40px; }
            .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
            .text { font-size: 15px; color: #475569; line-height: 1.7; margin-bottom: 16px; }
            .cta-wrap { text-align: center; margin: 32px 0; }
            .cta-btn {
              display: inline-block;
              padding: 15px 36px;
              background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%);
              color: #ffffff !important;
              text-decoration: none;
              font-size: 16px;
              font-weight: 600;
              border-radius: 12px;
              letter-spacing: 0.2px;
              box-shadow: 0 4px 16px rgba(13,148,136,0.35);
            }
            .divider { border: none; border-top: 1px solid #e2e8f0; margin: 28px 0; }
            .fallback-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; }
            .fallback-box p { font-size: 13px; color: #64748b; margin-bottom: 8px; }
            .fallback-url { font-size: 12px; color: #0d9488; word-break: break-all; font-family: monospace; }
            .warning { display: flex; gap: 10px; align-items: flex-start; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 14px 16px; margin-top: 24px; }
            .warning-icon { flex-shrink: 0; width: 18px; height: 18px; color: #ea580c; margin-top: 1px; }
            .warning p { font-size: 13px; color: #9a3412; line-height: 1.5; }
            .footer { text-align: center; padding: 24px 40px; border-top: 1px solid #f1f5f9; }
            .footer p { font-size: 12px; color: #94a3b8; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="card">
              <!-- Header -->
              <div class="header">
                <div class="logo-icon">
                  <svg width="28" height="28" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
                <h1>DermaCloud</h1>
                <p>AI-Powered Dermatology Platform</p>
              </div>

              <!-- Body -->
              <div class="body">
                <p class="greeting">Hi ${name},</p>
                <p class="text">
                  We received a request to reset the password for your DermaCloud account. Click the button below to choose a new password.
                </p>

                <div class="cta-wrap">
                  <a href="${resetUrl}" class="cta-btn">Reset My Password</a>
                </div>

                <p class="text" style="text-align:center; font-size:13px; color:#94a3b8;">
                  This link expires in <strong>1 hour</strong>.
                </p>

                <hr class="divider" />

                <!-- Fallback URL -->
                <div class="fallback-box">
                  <p>If the button doesn't work, copy and paste this link into your browser:</p>
                  <p class="fallback-url">${resetUrl}</p>
                </div>

                <!-- Warning -->
                <div class="warning">
                  <svg class="warning-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
                </div>
              </div>

              <!-- Footer -->
              <div class="footer">
                <p>&copy; 2026 DermaCloud. All rights reserved.<br />This is an automated email — please do not reply.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Password reset email sent to:", email);
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw new Error("Failed to send password reset email");
  }
}

/**
 * Send welcome email after successful registration
 */
export async function sendWelcomeEmail(email: string, name: string, tier: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const dashboardUrl = `${appUrl}/clinic/dashboard`;
  const firstName = name.split(" ")[0];

  const features = [
    { emoji: "&#129504;", label: "AI-Powered Skin Analysis", desc: "Instant diagnosis backed by deep learning" },
    { emoji: "&#128101;", label: "Smart Patient Management", desc: "Complete profiles, history, and visit tracking" },
    { emoji: "&#128203;", label: "Custom Consultation Forms", desc: "Tailored forms for dermatology &amp; cosmetology" },
    { emoji: "&#128247;", label: "Before / After Tracking", desc: "Visualise treatment progress over time" },
    { emoji: "&#128196;", label: "Professional Reports", desc: "Export polished PDF reports in seconds" },
    { emoji: "&#128138;", label: "Pharmacy &amp; Inventory", desc: "Track medicines and stock effortlessly" },
  ];

  const featureRows = features.map(f => `
    <tr>
      <td style="padding:0 0 10px 0;">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="width:48px;vertical-align:middle;padding:14px 0 14px 16px;">
              <div style="width:40px;height:40px;background:#f0fdfa;border-radius:10px;text-align:center;line-height:40px;font-size:20px;border:1px solid #ccfbf1;">
                ${f.emoji}
              </div>
            </td>
            <td style="vertical-align:middle;padding:14px 16px;">
              <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#0f172a;">${f.label}</p>
              <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">${f.desc}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join("");

  const mailOptions = {
    from: `"DermaCloud" <${EMAIL_FROM}>`,
    to: email,
    subject: `Welcome to DermaCloud, ${firstName}! Your account is ready &#127881;`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#334155;">
          <div style="max-width:600px;margin:40px auto;padding:0 16px 48px;">
            <div style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">

              <!-- Header -->
              <div style="background:linear-gradient(135deg,#0d9488 0%,#0891b2 100%);padding:44px 40px 40px;text-align:center;">
                <h1 style="color:#ffffff;font-size:30px;font-weight:800;letter-spacing:-0.5px;margin:0 0 6px;">DermaCloud</h1>
                <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:0 0 28px;">AI-Powered Dermatology Platform</p>
                <div style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:40px;padding:9px 24px;">
                  <span style="color:#ffffff;font-size:15px;font-weight:600;">&#127881; Account Created Successfully</span>
                </div>
              </div>

              <!-- Body -->
              <div style="padding:40px 40px 32px;">

                <p style="font-size:23px;font-weight:800;color:#0f172a;margin:0 0 12px;">Welcome aboard, ${firstName}!</p>
                <p style="font-size:15px;color:#475569;line-height:1.8;margin:0 0 10px;">
                  We're so glad you're here. Your DermaCloud account is live and everything is ready for you to explore.
                </p>
                <p style="font-size:15px;color:#475569;line-height:1.8;margin:0 0 32px;">
                  From AI-assisted diagnostics to streamlined patient care — you now have a complete toolkit built specifically for modern dermatology practice.
                </p>

                <!-- Features label -->
                <p style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1.2px;margin:0 0 14px;">Everything at your fingertips</p>

                <!-- Feature rows -->
                <div style="background:#fafafa;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:36px;">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    ${featureRows}
                  </table>
                </div>

                <!-- Divider -->
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 32px;" />

                <!-- CTA -->
                <p style="font-size:15px;color:#475569;line-height:1.7;text-align:center;margin:0 0 24px;">
                  Your dashboard is set up and ready. Jump right in &#8594;
                </p>
                <div style="text-align:center;margin-bottom:14px;">
                  <a href="${dashboardUrl}"
                     style="display:inline-block;padding:16px 48px;background:linear-gradient(135deg,#0d9488 0%,#0891b2 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;border-radius:14px;letter-spacing:0.3px;">
                    Open My Dashboard
                  </a>
                </div>
                <p style="text-align:center;font-size:12px;color:#94a3b8;margin:0;">
                  Or go to <a href="${appUrl}/login" style="color:#0d9488;text-decoration:none;">${appUrl}/login</a>
                </p>

                <!-- Warm note -->
                <div style="margin-top:36px;background:#f0fdfa;border-radius:14px;padding:22px 24px;border-left:4px solid #0d9488;">
                  <p style="font-size:14px;color:#475569;line-height:1.75;margin:0;">
                    We've put a lot of care into building DermaCloud, and we'd love to hear how it works for you. If you ever have a question or want to share feedback — we're always here.
                  </p>
                  <p style="font-size:14px;font-weight:700;color:#0d9488;margin:12px 0 0;">&#8212; The DermaCloud Team</p>
                </div>

              </div>

              <!-- Footer -->
              <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
                <p style="font-size:12px;color:#94a3b8;line-height:1.8;margin:0;">
                  &copy; 2026 DermaCloud. All rights reserved.<br />
                  This email was sent to <span style="color:#64748b;">${email}</span> because you created a DermaCloud account.<br />
                  This is an automated message &mdash; please do not reply directly.
                </p>
              </div>

            </div>
          </div>
        </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Welcome email sent successfully to:", email);
  } catch (error) {
    console.error("Error sending welcome email:", error);
    // Don't throw error for welcome email, it's not critical
  }
}

/**
 * Send account locked security alert email
 */
export async function sendAccountLockedEmail(
  email: string,
  lockedUntil: Date,
  ipAddress: string
): Promise<void> {
  const lockedUntilStr = lockedUntil.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  const mailOptions = {
    from: `"DermaCloud Security" <${EMAIL_FROM}>`,
    to: email,
    subject: "⚠️ Security Alert: Account Temporarily Locked — DermaCloud",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
            .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: white; padding: 30px; border-radius: 0 0 10px 10px; }
            .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin:0; font-size:24px;">Security Alert</h1>
              <p style="margin:8px 0 0; opacity:0.9;">DermaCloud Account Protection</p>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>Your DermaCloud account (<strong>${email}</strong>) has been <strong>temporarily locked</strong> due to multiple failed login attempts.</p>
              <div class="alert-box">
                <p style="margin:0;"><strong>Details:</strong></p>
                <ul style="margin:8px 0 0;">
                  <li>IP Address: ${ipAddress}</li>
                  <li>Locked until: ${lockedUntilStr} IST</li>
                </ul>
              </div>
              <p>If this was you (forgot your password), please wait for the lock to expire or use the <strong>Forgot Password</strong> option.</p>
              <p>If this was <strong>NOT you</strong>, someone may be trying to access your account. Please:</p>
              <ol>
                <li>Change your password immediately after the lock expires</li>
                <li>Contact us at support@dermacloud.in</li>
              </ol>
              <p style="margin-top:24px;">Stay safe,<br><strong>DermaCloud Security Team</strong></p>
            </div>
            <div class="footer">
              <p>© 2026 DermaCloud. This is an automated security alert.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending account locked email:", error);
  }
}
