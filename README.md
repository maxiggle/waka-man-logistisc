This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Deploy checklist

**Before the first deploy that includes distance-based pricing (WM-101 Phase 2 and later), run the seed script against that environment:**

```bash
pnpm run seed
```

Booking is priced from `config/pricing` (`src/server/pricingConfig.ts`), which fails closed — a missing or invalid document means **every quote 422s and no customer can book anything** (WM-104). The seed script is idempotent: it only ever creates `config/pricing` and the first `superadminInvites/{email}` entry when they're entirely absent, and never touches either if they already exist, so it's safe to run on every deploy, not just the first. Set `INITIAL_SUPERADMIN_EMAIL` before running it to also seed the first superadmin invite in one step (WM-105) — otherwise the pricing dashboard stays unreachable until someone is invited by hand in the Firebase console.

`/admin` shows a red banner if `config/pricing` is missing or fails validation — that's the operator-facing signal this step was missed or something corrupted the document later. The customer-facing failure (a 422 on `/api/quotes`) stays deliberately vague.
