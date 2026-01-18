import nodemailer from "nodemailer";

// Email configuration from environment variables
const EMAIL_HOST = process.env.EMAIL_HOST || "smtp.gmail.com";
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || "587");
const EMAIL_USER = process.env.EMAIL_USER || "";
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@dermahms.com";

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
    from: `"DermaHMS" <${EMAIL_FROM}>`,
    to: email,
    subject: "Your OTP for DermaHMS Signup",
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
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
              background: #f0f4ff;
              border: 2px dashed #667eea;
              padding: 20px;
              text-align: center;
              margin: 20px 0;
              border-radius: 8px;
            }
            .otp-code {
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 8px;
              color: #667eea;
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
              <h1>DermaHMS</h1>
              <p>AI-Powered Dermatology Platform</p>
            </div>
            <div class="content">
              <h2>Verify Your Email</h2>
              <p>Thank you for signing up with DermaHMS!</p>
              <p>Please use the following OTP to complete your registration:</p>

              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>

              <p><strong>This OTP is valid for 10 minutes.</strong></p>
              <p>If you didn't request this OTP, please ignore this email.</p>

              <p>Best regards,<br>The DermaHMS Team</p>
            </div>
            <div class="footer">
              <p>&copy; 2025 DermaHMS. All rights reserved.</p>
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
 * Send welcome email after successful registration
 */
export async function sendWelcomeEmail(email: string, name: string, tier: string): Promise<void> {
  const mailOptions = {
    from: `"DermaHMS" <${EMAIL_FROM}>`,
    to: email,
    subject: "Welcome to DermaHMS!",
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
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
            .button {
              display: inline-block;
              padding: 12px 24px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-decoration: none;
              border-radius: 8px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to DermaHMS! 🎉</h1>
            </div>
            <div class="content">
              <h2>Hello ${name}!</h2>
              <p>Your account has been successfully created with <strong>${tier === "tier1" ? "Tier 1 - Student" : "Tier 2 - Clinic"}</strong> plan.</p>

              <p>You can now access all the features of DermaHMS:</p>
              <ul>
                ${tier === "tier1"
                  ? `<li>5 AI scans per day</li>
                     <li>100-120 scans per month</li>
                     <li>AI-powered diagnosis</li>
                     <li>PDF & Word reports</li>`
                  : `<li>Unlimited AI scans</li>
                     <li>Full patient management</li>
                     <li>Custom consultation forms</li>
                     <li>Before/After tracking</li>
                     <li>Custom templates & branding</li>`
                }
              </ul>

              <div style="text-align: center;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login" class="button">
                  Get Started
                </a>
              </div>

              <p>If you have any questions, feel free to reach out to our support team.</p>

              <p>Best regards,<br>The DermaHMS Team</p>
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
