// @paystack/inline-js ships no type declarations (checked: no "types"/"typings"
// field in its package.json, no .d.ts files). Minimal surface only — what
// src/components/LiveTracking.tsx actually calls.
declare module "@paystack/inline-js" {
  interface PaystackTransaction {
    reference: string;
    [key: string]: unknown;
  }

  interface ResumeTransactionOptions {
    onSuccess?: (transaction: PaystackTransaction) => void;
    onCancel?: () => void;
    onLoad?: (transaction: PaystackTransaction) => void;
    onError?: (error: unknown) => void;
  }

  export default class PaystackPop {
    resumeTransaction(accessCode: string, options?: ResumeTransactionOptions): void;
  }
}
