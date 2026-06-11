# Future: Commercial Readiness Phase (saved for later)

> Saved verbatim from the program owner on **2026-06-11**.
> Do **not** start this work until Phase 4 (Ballroom Canvas) is signed off.
> Per the owner: **"Don't connect to Supabase yet — connect locally first."** All Phase 5 work should be validated against the local Postgres / local Firebase emulator setup before touching any production secret.

---

## Original brief (commercialisation phase)

To transition from a "working tool" to a "sellable asset," we need to prepare the B2B Infrastructure. We aren't just selling code; we are selling onboarding, security, and reliability.

### The "Commercial Readiness" Setup Prompt

> We are now moving into the 'Commercialization Phase' for ArrangeMySeats. I need to set up the infrastructure so I can begin onboarding hotel program directors. Configure the following to make the repository and app 'production-ready':

#### 1. Authentication & Tenant Isolation
- Implement a **multi-tenant structure** in Firestore. Every event/program must be siloed. Ensure that no user can see data from another hotel program.
- Setup **Role-Based Access Control (RBAC)**: define `Admin` (Program Director) and `Staff` (Planner) roles.

#### 2. Production Environment Setup
- Configure environment variables: create a `.env.example` file and move all API keys (Firebase, Mapbox, etc.) out of the codebase.
- Setup **Firebase Hosting**: ensure the `firebase.json` and CI/CD pipeline are configured to distinguish between development and production environments so we don't accidentally wipe live client data.

#### 3. Onboarding Logic
- Create a simple **'New Program' flow**: when a director signs up, they should be able to create a unique `Program ID` (e.g. `passover-2027-hotelname`).
- Ensure that all URLs and database queries are scoped to this `Program ID`.

#### 4. Data Security Audit
- Draft a set of Firestore Security Rules that enforces the following:
  - read/write access is ONLY granted if the user's `programId` matches the document's `programId`.
  - Verify that guest data is not publicly queryable.

#### 5. Legal & Professional Polish
- Create a `TERMS.md` and `PRIVACY.md` file in the root. (The owner will fill in the legal text later, just prepare the structure.)
- Add a `CONTACT.md` for support requests, linked to a professional email address (e.g. `support@arrangemyseats.com`).

#### 6. Deployment Readiness
- Check for any `debug` console logs, test data, or hard-coded `TODO` comments in the code that shouldn't be seen by a client. Clean these up.

#### Goal
> My goal is to be able to invite a client to test their layout without them being able to see or access any other client's data. **Prioritize security and tenant isolation.**

---

## Why this setup is essential for selling (owner's notes, preserved)

- **The "Silo" Requirement**: if we don't implement tenant isolation (Item #1), we cannot sell this. If Program Director A can see Program Director B’s guest list, the business will end before it starts.
- **The "Professional" Layer**: items #2 and #5 show a potential client that we are a serious business, not just a solo dev playing with code.
- **Ready for Audit**: by setting up these structures now, when we hire that human developer for the final audit, they will see that we already have the enterprise-grade foundation in place.

---

## Status

**Not started.** Pick up after Phase 4 sign-off. See [`TASKS.md`](./TASKS.md) for the active roadmap.
