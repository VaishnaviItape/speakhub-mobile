/**
 * Email Service using EmailJS (or similar provider)
 * This allows sending emails directly from the client without a backend.
 */

// TODO: Install emailjs-com if you intend to use actual EmailJS: npm install emailjs-com
// import emailjs from 'emailjs-com';

export const sendEmail = async (toEmail: string, subject: string, message: string) => {
  try {
    // In a real environment, uncomment the code below and configure EmailJS
    /*
    await emailjs.send(
      'YOUR_SERVICE_ID',
      'YOUR_TEMPLATE_ID',
      {
        to_email: toEmail,
        subject: subject,
        message: message,
      },
      'YOUR_USER_ID'
    );
    */
    
    // For development, we just log it to ensure the logic works.
    console.log(`[Mock Email Sent] To: ${toEmail} | Subject: ${subject}`);
    console.log(`Message: ${message}`);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
};
