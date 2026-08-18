export type userTypes = "retail" | "business";

export interface RetailUser {
    _id: string;
    name: string;
    email: string;
    phone: string;
    settings?: {
        currency: string;
        darkMode: boolean;
        preferences: {
            investmentUpdates: boolean;
            newsInsights: boolean;
            securityAlerts: boolean;
            transactionConfirmations: boolean;
        }
    }
}

export interface BusinessUser {
    _id: string;
    displayName: string;
    legalName: string;
    email: string;
    phone: string;
    logo?: string;
    isVerified: boolean;
    settings?: {
        currency: string;
        darkMode: boolean;
        preferences: {
            securityAlerts: boolean;
            transactionAlerts: boolean;
        }
    }
}