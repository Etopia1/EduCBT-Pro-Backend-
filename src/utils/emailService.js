const nodemailer = require('nodemailer');

// Create a transporter using Gmail (or other service) credentials from .env
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // jolaetopia81@gmail.com
        pass: process.env.EMAIL_PASS  // zbux olmk aqad rupy
    }
});

exports.sendVerificationEmail = async (to, token, extraInfo = {}) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verificationLink = `${frontendUrl}/#/verify-email?token=${token}`;

    console.log(`[EMAIL SERVICE] Sending Email to: ${to}`);
    console.log(`[EMAIL SERVICE] Link: ${verificationLink}`);

    const { loginId, password } = extraInfo;

    const mailOptions = {
        from: '"RICSHUB CBT" <' + process.env.EMAIL_USER + '>',
        to: to,
        subject: 'Verify your School Account & Credentials',
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #333;">Welcome to RICSHUB CBT!</h2>
                
                ${loginId ? `
                <div style="background: #f8f9fa; padding: 15px; border-left: 4px solid #4f46e5; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #4f46e5;">Your Credentials</h3>
                    <p style="margin: 5px 0;"><strong>Login ID:</strong> ${loginId}</p>
                    ${password ? `<p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>` : ''}
                    <p style="font-size: 0.9em; color: #666;">(Please save these details!)</p>
                </div>
                ` : ''}

                <p>Please verify your school account to access the dashboard.</p>
                <div style="margin: 20px 0;">
                    <a href="${verificationLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email</a>
                </div>
                <p style="color: #666; font-size: 14px;">Or copy this link:<br>
                <a href="${verificationLink}">${verificationLink}</a></p>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('[EMAIL SERVICE] Email Sent ID:', info.messageId);
    } catch (error) {
        console.error('[EMAIL SERVICE] Error sending email:', error);
    }
};

exports.sendOTPEmail = async (to, otp) => {
    console.log(`[EMAIL SERVICE] Sending OTP to: ${to}`);

    const mailOptions = {
        from: '"RICSHUB CBT" <' + process.env.EMAIL_USER + '>',
        to: to,
        subject: 'Your Verification Code - RICSHUB CBT',
        html: `
            <div style="font-family: sans-serif; padding: 40px; border: 1px solid #eee; border-radius: 12px; max-width: 500px; margin: 0 auto; text-align: center;">
                <h1 style="color: #4f46e5; font-size: 28px; font-weight: bold; margin-bottom: 30px;">RICSHUB CBT</h1>
                <h2 style="color: #333; margin-bottom: 20px;">Verify Your Identity</h2>
                <p style="color: #666; font-size: 16px; margin-bottom: 30px;">Use the verification code below to complete your registration or login.</p>
                
                <div style="background: #f3f4f6; padding: 20px; border-radius: 10px; margin-bottom: 30px;">
                    <span style="font-size: 42px; font-weight: bold; letter-spacing: 8px; color: #111827;">${otp}</span>
                </div>

                <p style="color: #9ca3af; font-size: 14px;">This code will expire in 10 minutes.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #9ca3af; font-size: 12px;">© ${new Date().getFullYear()} RICSHUB CBT. All rights reserved.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('[EMAIL SERVICE] OTP Email Sent');
    } catch (error) {
        console.error('[EMAIL SERVICE] Error sending OTP email:', error);
    }
};

// Send Teacher Welcome Email with Generated ID
exports.sendTeacherWelcomeEmail = async (to, fullName, uniqueLoginId, password) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    console.log(`[EMAIL SERVICE] Sending Teacher ID to: ${to}`);

    const mailOptions = {
        from: '"RICSHUB CBT" <' + process.env.EMAIL_USER + '>',
        to: to,
        subject: 'Welcome to RICSHUB CBT - Your Teacher Login ID',
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #333;">Welcome, ${fullName}!</h2>
                <p>Your teacher account has been created successfully.</p>
                
                <div style="background: #eef2ff; padding: 15px; border-left: 4px solid #4f46e5; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #4f46e5;">Your Login Credentials</h3>
                    <p style="margin: 5px 0;"><strong>Login ID:</strong> <span style="font-size: 1.2em; font-weight: bold;">${uniqueLoginId}</span></p>
                    <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
                </div>

                <p>You can verify your account status and log in here:</p>
                <div style="margin: 20px 0;">
                    <a href="${frontendUrl}/#/login" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Login to Dashboard</a>
                </div>
                
                <p style="color: #666; font-size: 13px;">Note: If you cannot log in immediately, please wait for your School Admin to approve your account.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('[EMAIL SERVICE] Teacher Email Sent');
    } catch (error) {
        console.error('[EMAIL SERVICE] Error sending email:', error);
    }
};

/**
 * Send Subscription Receipt Email with PDF attachment
 * @param {string} to - Recipient email
 * @param {Object} receiptInfo - Receipt details
 * @param {string} pdfPath - Path to PDF receipt file
 */
exports.sendSubscriptionReceipt = async (to, receiptInfo, pdfPath) => {
    const { schoolName, plan, amount, currency, receiptNumber, periodEnd } = receiptInfo;

    console.log(`[EMAIL SERVICE] Sending subscription receipt to: ${to}`);

    const mailOptions = {
        from: '"RICSHUB CBT - Billing" <' + process.env.EMAIL_USER + '>',
        to: to,
        subject: `Payment Receipt - ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan Subscription`,
        html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Payment Successful!</h1>
                    <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 16px;">Thank you for your subscription</p>
                </div>

                <!-- Content -->
                <div style="padding: 40px 30px; background-color: #f9fafb;">
                    <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
                        Dear <strong>${schoolName}</strong>,
                    </p>

                    <p style="font-size: 15px; color: #6b7280; line-height: 1.6;">
                        Your payment for the <strong style="color: #4f46e5;">${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan</strong> has been successfully processed. 
                        Your subscription is now active and you have full access to all features.
                    </p>

                    <!-- Payment Summary Box -->
                    <div style="background-color: #ffffff; border: 2px solid #e5e7eb; border-radius: 12px; padding: 25px; margin: 30px 0;">
                        <h2 style="color: #1f2937; font-size: 18px; margin: 0 0 20px 0; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px;">
                            Payment Summary
                        </h2>
                        
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Receipt Number:</td>
                                <td style="padding: 10px 0; color: #1f2937; font-weight: bold; text-align: right; font-size: 14px;">${receiptNumber}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Subscription Plan:</td>
                                <td style="padding: 10px 0; color: #1f2937; font-weight: bold; text-align: right; font-size: 14px;">${plan.charAt(0).toUpperCase() + plan.slice(1)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Valid Until:</td>
                                <td style="padding: 10px 0; color: #1f2937; font-weight: bold; text-align: right; font-size: 14px;">
                                    ${new Date(periodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                </td>
                            </tr>
                            <tr style="border-top: 2px solid #f3f4f6;">
                                <td style="padding: 15px 0 0 0; color: #1f2937; font-size: 16px; font-weight: bold;">Amount Paid:</td>
                                <td style="padding: 15px 0 0 0; color: #16a34a; font-weight: bold; text-align: right; font-size: 20px;">
                                    $${(amount / 100).toFixed(2)} ${currency.toUpperCase()}
                                </td>
                            </tr>
                        </table>
                    </div>

                    <!-- Call to Action -->
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL}/#/admin/dashboard" 
                           style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; box-shadow: 0 4px 6px rgba(79, 70, 229, 0.3);">
                            Access Your Dashboard
                        </a>
                    </div>

                    <p style="font-size: 13px; color: #9ca3af; line-height: 1.5; margin-top: 30px;">
                        📎 <strong>Receipt Attached:</strong> A detailed PDF receipt is attached to this email for your records.
                    </p>
                </div>

                <!-- Footer -->
                <div style="background-color: #f3f4f6; padding: 25px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 13px; margin: 0;">
                        If you have any questions about your subscription, please contact us at<br>
                        <a href="mailto:support@ricshub.ng" style="color: #4f46e5; text-decoration: none; font-weight: bold;">support@ricshub.ng</a>
                    </p>
                    <p style="color: #9ca3af; font-size: 12px; margin: 15px 0 0 0;">
                        © ${new Date().getFullYear()} RICSHUB CBT. All rights reserved.
                    </p>
                </div>
            </div>
        `,
        attachments: [
            {
                filename: `Receipt-${receiptNumber}.pdf`,
                path: pdfPath,
                contentType: 'application/pdf'
            }
        ]
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('[EMAIL SERVICE] ✅ Receipt Email Sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('[EMAIL SERVICE] ❌ Error sending receipt:', error);
        throw error;
    }
};

