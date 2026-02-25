const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate a subscription payment receipt as PDF
 * @param {Object} receiptData - Payment and subscription details
 * @returns {Promise<string>} - Path to generated PDF
 */
exports.generateSubscriptionReceipt = async (receiptData) => {
    const {
        receiptNumber,
        schoolName,
        schoolEmail,
        plan,
        interval,
        amount,
        currency,
        paymentDate,
        paymentMethod,
        transactionId,
        periodStart,
        periodEnd
    } = receiptData;

    return new Promise((resolve, reject) => {
        try {
            // Create receipts directory if it doesn't exist
            const receiptsDir = path.join(__dirname, '../receipts');
            if (!fs.existsSync(receiptsDir)) {
                fs.mkdirSync(receiptsDir, { recursive: true });
            }

            const filename = `receipt-${receiptNumber}.pdf`;
            const filepath = path.join(receiptsDir, filename);

            // Create PDF document
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const stream = fs.createWriteStream(filepath);

            doc.pipe(stream);

            // --- HEADER ---
            doc.fontSize(28).font('Helvetica-Bold').text('PAYMENT RECEIPT', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica').fillColor('#666666')
                .text('CBT System - Subscription Payment', { align: 'center' });
            doc.moveDown(2);

            // --- RECEIPT INFO BOX ---
            const boxY = doc.y;
            doc.rect(50, boxY, 495, 60).fillAndStroke('#f0f9ff', '#3b82f6');

            doc.fillColor('#000000').fontSize(11).font('Helvetica-Bold');
            doc.text('Receipt Number:', 70, boxY + 15);
            doc.font('Helvetica').text(receiptNumber, 200, boxY + 15);

            doc.font('Helvetica-Bold').text('Date:', 70, boxY + 35);
            doc.font('Helvetica').text(new Date(paymentDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }), 200, boxY + 35);

            doc.moveDown(4);

            // --- CUSTOMER DETAILS ---
            doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e40af').text('Customer Information');
            doc.moveDown(0.5);

            doc.fontSize(11).fillColor('#000000').font('Helvetica-Bold').text('School Name:');
            doc.font('Helvetica').text(schoolName, 70);
            doc.moveDown(0.3);

            doc.font('Helvetica-Bold').text('Email:');
            doc.font('Helvetica').text(schoolEmail, 70);
            doc.moveDown(1.5);

            // --- SUBSCRIPTION DETAILS ---
            doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e40af').text('Subscription Details');
            doc.moveDown(0.5);

            // Table Header
            const tableTop = doc.y;
            doc.rect(50, tableTop, 495, 30).fillAndStroke('#e0e7ff', '#3b82f6');
            doc.fillColor('#000000').fontSize(11).font('Helvetica-Bold');
            doc.text('Plan', 70, tableTop + 10);
            doc.text('Billing Cycle', 250, tableTop + 10);
            doc.text('Amount', 420, tableTop + 10);

            // Table Row
            const rowY = tableTop + 30;
            doc.rect(50, rowY, 495, 30).stroke('#e5e7eb');
            doc.font('Helvetica').fontSize(11);
            doc.text(`${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`, 70, rowY + 10);
            doc.text(interval === 'month' ? 'Monthly' : 'Yearly', 250, rowY + 10);
            doc.text(`$${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`, 420, rowY + 10);

            doc.moveDown(3);

            // --- BILLING PERIOD ---
            doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e40af').text('Billing Period');
            doc.moveDown(0.5);
            doc.fontSize(11).font('Helvetica').fillColor('#000000');
            doc.text(`From: ${new Date(periodStart).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
            doc.text(`To: ${new Date(periodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
            doc.moveDown(1.5);

            // --- PAYMENT DETAILS ---
            doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e40af').text('Payment Information');
            doc.moveDown(0.5);
            doc.fontSize(11).font('Helvetica').fillColor('#000000');
            doc.text(`Payment Method: ${paymentMethod || 'Credit Card'}`);
            doc.text(`Transaction ID: ${transactionId || 'N/A'}`);
            doc.text(`Status: PAID`, { continued: false });
            doc.moveDown(1.5);

            // --- TOTAL AMOUNT BOX ---
            const totalBoxY = doc.y;
            doc.rect(320, totalBoxY, 225, 50).fillAndStroke('#dcfce7', '#22c55e');
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000');
            doc.text('TOTAL PAID:', 340, totalBoxY + 10);
            doc.fontSize(20).fillColor('#16a34a');
            doc.text(`$${(amount / 100).toFixed(2)} USD`, 340, totalBoxY + 28);

            // --- FOOTER ---
            doc.moveDown(4);
            doc.fontSize(9).font('Helvetica').fillColor('#6b7280').text(
                'Thank you for your subscription! This receipt serves as proof of payment.',
                { align: 'center' }
            );
            doc.moveDown(0.5);
            doc.fontSize(8).fillColor('#9ca3af').text(
                'For questions or support, please contact support@cbtsystem.com',
                { align: 'center' }
            );

            // Add page border
            doc.rect(30, 30, 535, 782).stroke('#e5e7eb');

            // Finalize PDF
            doc.end();

            stream.on('finish', () => {
                console.log(`✅ Receipt PDF generated: ${filepath}`);
                resolve(filepath);
            });

            stream.on('error', (error) => {
                console.error('❌ Error creating PDF:', error);
                reject(error);
            });

        } catch (error) {
            console.error('❌ Error in generateSubscriptionReceipt:', error);
            reject(error);
        }
    });
};
