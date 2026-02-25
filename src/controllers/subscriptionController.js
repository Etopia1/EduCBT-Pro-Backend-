const Subscription = require('../models/Subscription');
const School = require('../models/School');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Get subscription plans and pricing
exports.getPlans = async (req, res) => {
    try {
        const plans = Subscription.getPlanPricing();
        res.json({ success: true, plans });
    } catch (error) {
        console.error('Error fetching plans:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch plans' });
    }
};

// Get school's current subscription
exports.getSubscription = async (req, res) => {
    try {
        const { schoolId } = req.params;

        // --- ADMIN BYPASS LOGIC START ---
        const adminSchool = await School.findById(schoolId);
        if (adminSchool && adminSchool.schoolLoginId === 'SCH-20670E') {
            return res.json({
                success: true,
                subscription: {
                    _id: 'sub_admin_bypass_' + schoolId,
                    schoolId,
                    plan: 'premium',
                    status: 'active',
                    pricing: { amount: 0, currency: 'usd', interval: 'year' },
                    features: {
                        basicExams: true,
                        proctoriedExams: true,
                        maxStudents: -1,
                        maxTeachers: -1,
                        maxExamsPerMonth: -1,
                        analytics: true,
                        customBranding: true
                    },
                    currentPeriodStart: new Date(),
                    currentPeriodEnd: new Date('2099-12-31')
                },
                isActive: true
            });
        }
        // --- ADMIN BYPASS LOGIC END ---

        let subscription = await Subscription.findOne({ schoolId }).populate('schoolId');

        // If no subscription exists, create a trial subscription
        if (!subscription) {
            const school = await School.findById(schoolId);
            if (!school) {
                return res.status(404).json({ success: false, message: 'School not found' });
            }

            const trialEndsAt = new Date();
            trialEndsAt.setDate(trialEndsAt.getDate() + 14); // 14-day trial

            subscription = await Subscription.create({
                schoolId,
                plan: 'basic',
                status: 'trial',
                pricing: {
                    amount: 0,
                    currency: 'usd',
                    interval: 'month'
                },
                trialEndsAt,
                features: {
                    basicExams: true,
                    proctoriedExams: false,
                    maxStudents: 50,
                    maxTeachers: 5,
                    maxExamsPerMonth: 10,
                    analytics: false,
                    customBranding: false
                }
            });

            // Update school with subscription ID
            school.subscriptionId = subscription._id;
            await school.save();
        }

        res.json({
            success: true,
            subscription,
            isActive: subscription.isActive()
        });
    } catch (error) {
        console.error('Error fetching subscription:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch subscription' });
    }
};

// Create Stripe checkout session
exports.createCheckoutSession = async (req, res) => {
    try {
        const { schoolId, plan, interval } = req.body;

        if (!['basic', 'proctored', 'premium'].includes(plan)) {
            return res.status(400).json({ success: false, message: 'Invalid plan' });
        }

        if (!['month', 'year'].includes(interval)) {
            return res.status(400).json({ success: false, message: 'Invalid interval' });
        }

        const school = await School.findById(schoolId);
        if (!school) {
            return res.status(404).json({ success: false, message: 'School not found' });
        }

        const pricing = Subscription.getPlanPricing();
        const planPrice = interval === 'month' ? pricing[plan].monthly : pricing[plan].yearly;

        // Create or retrieve Stripe customer
        let customerId;
        const subscription = await Subscription.findOne({ schoolId });

        if (subscription && subscription.stripeCustomerId) {
            customerId = subscription.stripeCustomerId;
        } else {
            const customer = await stripe.customers.create({
                email: school.email,
                name: school.name,
                metadata: {
                    schoolId: schoolId.toString()
                }
            });
            customerId = customer.id;
        }

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
                            description: `${interval === 'month' ? 'Monthly' : 'Yearly'} subscription`,
                        },
                        unit_amount: planPrice,
                        recurring: {
                            interval: interval === 'month' ? 'month' : 'year'
                        }
                    },
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${process.env.FRONTEND_URL}/#/school/subscription?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/#/school/subscription?payment=cancelled`,
            metadata: {
                schoolId: schoolId.toString(),
                plan,
                interval
            }
        });

        res.json({ success: true, sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ success: false, message: 'Failed to create checkout session' });
    }
};

// Handle Stripe webhook events
exports.handleWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            await handleCheckoutSessionCompleted(event.data.object);
            break;
        case 'customer.subscription.updated':
            await handleSubscriptionUpdated(event.data.object);
            break;
        case 'customer.subscription.deleted':
            await handleSubscriptionDeleted(event.data.object);
            break;
        case 'invoice.payment_succeeded':
            await handlePaymentSucceeded(event.data.object);
            break;
        case 'invoice.payment_failed':
            await handlePaymentFailed(event.data.object);
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
};

// Handle successful checkout
async function handleCheckoutSessionCompleted(session) {
    try {
        const { schoolId, plan, interval } = session.metadata;
        const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);

        const pricing = Subscription.getPlanPricing();
        const features = getFeaturesByPlan(plan);

        let subscription = await Subscription.findOne({ schoolId });
        const school = await School.findById(schoolId);

        if (!school) {
            console.error('❌ School not found for subscription:', schoolId);
            return;
        }

        if (subscription) {
            // Update existing subscription
            subscription.plan = plan;
            subscription.status = 'active';
            subscription.pricing = {
                amount: interval === 'month' ? pricing[plan].monthly : pricing[plan].yearly,
                currency: 'usd',
                interval
            };
            subscription.stripeCustomerId = session.customer;
            subscription.stripeSubscriptionId = session.subscription;
            subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
            subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
            subscription.features = features;
            subscription.trialEndsAt = null;
        } else {
            // Create new subscription
            subscription = new Subscription({
                schoolId,
                plan,
                status: 'active',
                pricing: {
                    amount: interval === 'month' ? pricing[plan].monthly : pricing[plan].yearly,
                    currency: 'usd',
                    interval
                },
                stripeCustomerId: session.customer,
                stripeSubscriptionId: session.subscription,
                currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
                currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
                features
            });
        }

        await subscription.save();

        // Update school with subscription ID
        await School.findByIdAndUpdate(schoolId, { subscriptionId: subscription._id });

        console.log('✅ Subscription activated for school:', schoolId);

        // 📧 GENERATE AND SEND RECEIPT
        try {
            const receiptGenerator = require('../utils/receiptGenerator');
            const emailService = require('../utils/emailService');

            // Generate unique receipt number
            const receiptNumber = `CBT-${Date.now()}-${schoolId.toString().slice(-6).toUpperCase()}`;

            // Prepare receipt data
            const receiptData = {
                receiptNumber,
                schoolName: school.name,
                schoolEmail: school.email,
                plan,
                interval,
                amount: subscription.pricing.amount,
                currency: subscription.pricing.currency,
                paymentDate: new Date(),
                paymentMethod: 'Credit Card',
                transactionId: session.payment_intent || session.id,
                periodStart: subscription.currentPeriodStart,
                periodEnd: subscription.currentPeriodEnd
            };

            // Generate PDF receipt
            console.log('📄 Generating PDF receipt...');
            const pdfPath = await receiptGenerator.generateSubscriptionReceipt(receiptData);

            // Send receipt via email
            console.log('📧 Sending receipt email...');
            await emailService.sendSubscriptionReceipt(
                school.email,
                {
                    schoolName: school.name,
                    plan,
                    amount: subscription.pricing.amount,
                    currency: subscription.pricing.currency,
                    receiptNumber,
                    periodEnd: subscription.currentPeriodEnd
                },
                pdfPath
            );

            console.log('✅ Receipt generated and emailed successfully!');

        } catch (receiptError) {
            console.error('❌ Error generating/sending receipt:', receiptError);
            // Don't fail the entire operation if receipt fails
        }

    } catch (error) {
        console.error('Error handling checkout session:', error);
    }
}

// Handle subscription updates
async function handleSubscriptionUpdated(stripeSubscription) {
    try {
        const subscription = await Subscription.findOne({
            stripeSubscriptionId: stripeSubscription.id
        });

        if (subscription) {
            subscription.status = stripeSubscription.status === 'active' ? 'active' : 'inactive';
            subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
            subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
            await subscription.save();
            console.log('✅ Subscription updated:', subscription._id);
        }
    } catch (error) {
        console.error('Error handling subscription update:', error);
    }
}

// Handle subscription cancellation
async function handleSubscriptionDeleted(stripeSubscription) {
    try {
        const subscription = await Subscription.findOne({
            stripeSubscriptionId: stripeSubscription.id
        });

        if (subscription) {
            subscription.status = 'cancelled';
            subscription.cancelledAt = new Date();
            await subscription.save();
            console.log('✅ Subscription cancelled:', subscription._id);
        }
    } catch (error) {
        console.error('Error handling subscription deletion:', error);
    }
}

// Handle successful payment
async function handlePaymentSucceeded(invoice) {
    try {
        const subscription = await Subscription.findOne({
            stripeCustomerId: invoice.customer
        });

        if (subscription) {
            subscription.paymentHistory.push({
                amount: invoice.amount_paid,
                currency: invoice.currency,
                status: 'succeeded',
                stripePaymentId: invoice.payment_intent,
                paidAt: new Date(invoice.created * 1000),
                description: invoice.lines.data[0]?.description || 'Subscription payment'
            });
            await subscription.save();
            console.log('✅ Payment recorded for subscription:', subscription._id);
        }
    } catch (error) {
        console.error('Error handling payment success:', error);
    }
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
    try {
        const subscription = await Subscription.findOne({
            stripeCustomerId: invoice.customer
        });

        if (subscription) {
            subscription.paymentHistory.push({
                amount: invoice.amount_due,
                currency: invoice.currency,
                status: 'failed',
                stripePaymentId: invoice.payment_intent,
                paidAt: new Date(invoice.created * 1000),
                description: 'Payment failed'
            });
            // Optionally set subscription to inactive after failed payment
            // subscription.status = 'inactive';
            await subscription.save();
            console.log('❌ Payment failed for subscription:', subscription._id);
        }
    } catch (error) {
        console.error('Error handling payment failure:', error);
    }
}

// Helper function to get features by plan
function getFeaturesByPlan(plan) {
    const featuresMap = {
        basic: {
            basicExams: true,
            proctoriedExams: false,
            maxStudents: 50,
            maxTeachers: 5,
            maxExamsPerMonth: 10,
            analytics: false,
            customBranding: false
        },
        proctored: {
            basicExams: true,
            proctoriedExams: true,
            maxStudents: 200,
            maxTeachers: 20,
            maxExamsPerMonth: -1, // Unlimited
            analytics: true,
            customBranding: false
        },
        premium: {
            basicExams: true,
            proctoriedExams: true,
            maxStudents: -1, // Unlimited
            maxTeachers: -1, // Unlimited
            maxExamsPerMonth: -1, // Unlimited
            analytics: true,
            customBranding: true
        }
    };

    return featuresMap[plan] || featuresMap.basic;
}

// Cancel subscription
exports.cancelSubscription = async (req, res) => {
    try {
        const { schoolId } = req.params;

        const subscription = await Subscription.findOne({ schoolId });
        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }

        if (subscription.stripeSubscriptionId) {
            await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
        }

        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        await subscription.save();

        res.json({ success: true, message: 'Subscription cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
    }
};

// Verify session after successful payment
exports.verifySession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === 'paid') {
            const schoolId = session.metadata.schoolId;
            const plan = session.metadata.plan;
            
            // Find or create subscription
            let subscription = await Subscription.findOne({ schoolId });
            
            if (subscription) {
                subscription.status = 'active';
                subscription.plan = plan;
                subscription.features = getFeaturesByPlan(plan);
                await subscription.save();
            }

            // Sync school
            await School.findByIdAndUpdate(schoolId, { 
                subscriptionId: subscription ? subscription._id : undefined 
            });

            res.json({
                success: true,
                subscription,
                session: {
                    status: session.payment_status,
                    customerEmail: session.customer_details.email
                }
            });
        } else {
            res.json({ success: false, message: 'Payment not completed' });
        }
    } catch (error) {
        console.error('Error verifying session:', error);
        res.status(500).json({ success: false, message: 'Server error during verification' });
    }
};
