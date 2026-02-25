const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        unique: true
    },
    plan: {
        type: String,
        enum: ['basic', 'proctored', 'premium'],
        required: true
    },
    planDetails: {
        name: String,
        description: String,
        features: [String]
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'cancelled', 'expired', 'trial', 'trialing'],
        default: 'trial'
    },
    pricing: {
        amount: { type: Number, required: true }, // Amount in cents
        currency: { type: String, default: 'usd' },
        interval: { type: String, enum: ['month', 'year'], default: 'month' }
    },
    stripeCustomerId: { type: String }, // Stripe customer ID
    stripeSubscriptionId: { type: String }, // Stripe subscription ID
    stripePaymentIntentId: { type: String }, // Latest payment intent
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    trialEndsAt: { type: Date },
    cancelledAt: { type: Date },
    paymentHistory: [{
        amount: Number,
        currency: String,
        status: String,
        stripePaymentId: String,
        paidAt: Date,
        description: String
    }],
    features: {
        basicExams: { type: Boolean, default: true }, // All plans have basic exams
        proctoriedExams: { type: Boolean, default: false }, // Only proctored/premium plans
        maxStudents: { type: Number, default: 50 }, // Limit based on plan
        maxTeachers: { type: Number, default: 5 },
        maxExamsPerMonth: { type: Number, default: 10 },
        analytics: { type: Boolean, default: false },
        customBranding: { type: Boolean, default: false }
    }
}, { timestamps: true });

// Method to check if subscription is active
subscriptionSchema.methods.isActive = function () {
    const now = new Date();
    
    // Trial status
    if ((this.status === 'trial' || this.status === 'trialing') && this.trialEndsAt && now < this.trialEndsAt) {
        return true;
    }
    
    // Active status
    if (this.status === 'active') {
        // If we have end date, check it. Otherwise assume active if status is 'active'
        if (this.currentPeriodEnd) {
            return now < this.currentPeriodEnd;
        }
        return true;
    }
    
    return false;
};

// Method to check if feature is available
subscriptionSchema.methods.hasFeature = function (feature) {
    // Direct feature flag check
    if (this.features && this.features[feature] === true) return true;
    
    // Fallback: Check based on plan name for core features
    if (feature === 'proctoriedExams' || feature === 'proctoring') {
        return ['proctored', 'premium'].includes(this.plan);
    }
    
    if (feature === 'customBranding') {
        return this.plan === 'premium';
    }
    
    if (feature === 'analytics') {
        return ['proctored', 'premium'].includes(this.plan);
    }
    
    return false;
};

// Static method to get plan pricing
subscriptionSchema.statics.getPlanPricing = function () {
    return {
        basic: {
            monthly: 1999, // $19.99
            yearly: 19999, // $199.99 (save ~17%)
            features: [
                'Basic exam mode (no proctoring)',
                'Up to 50 students',
                'Up to 5 teachers',
                'Up to 10 exams per month',
                'Basic analytics'
            ]
        },
        proctored: {
            monthly: 4999, // $49.99
            yearly: 49999, // $499.99 (save ~17%)
            features: [
                'Basic exam mode',
                'Proctored exam mode (camera, audio, violations)',
                'Up to 200 students',
                'Up to 20 teachers',
                'Unlimited exams',
                'Advanced analytics',
                'Screen sharing monitoring'
            ]
        },
        premium: {
            monthly: 9999, // $99.99
            yearly: 99999, // $999.99 (save ~17%)
            features: [
                'All proctored features',
                'Unlimited students',
                'Unlimited teachers',
                'Custom branding',
                'Priority support',
                'API access',
                'Advanced reporting'
            ]
        }
    };
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
