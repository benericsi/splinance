/** The privacy notice (GDPR Art. 13). Change both languages together with the setup. */
export const privacy = {
  pageTitle: 'Privacy',
  title: 'Privacy notice',
  intro:
    'How Splinance handles personal data, under Article 13 of the EU General Data Protection Regulation (GDPR).',
  inEffect: 'In effect from {{date}}',
  backToApp: 'Back to Splinance',
  logIn: 'Log in',
  tableLabel: 'Data, purpose, legal basis and retention',
  columns: { data: 'Data', purpose: 'Purpose', basis: 'Legal basis', kept: 'Kept' },
  contract: 'Contract (Art. 6(1)(b))',
  legitimateInterest: 'Legitimate interest (Art. 6(1)(f))',
  rows: {
    account: {
      data: 'Account: email, display name, a password hash (Argon2id) or your Google account id',
      purpose: 'Your account and signing in',
      kept: 'Until the account is deleted; the Google account id until you disconnect Google in account settings',
    },
    household: {
      data: 'Household data: members and roles, transactions, splits, payments, categories, rules, budgets, edit history',
      purpose: 'The service itself',
      kept: 'While the household exists; shared entries stay for the other members after you leave, because their balances depend on them',
    },
    imports: {
      data: "Bank imports: the rows you import and the file's name",
      purpose: 'Adding transactions',
      kept: 'Like household data; the file itself is never stored',
    },
    sessions: {
      data: 'Sessions: a hashed token per device',
      purpose: 'Keeping you signed in',
      kept: '30 days after last use',
    },
    invites: {
      data: 'Invite links: a hashed token',
      purpose: 'Joining a household',
      kept: '7 days',
    },
    logs: {
      data: "Request logs: the hosting provider's records of each request (IP address, address requested, time); our own logs leave tokens out and hold no IP",
      purpose: 'Security, abuse limits, fixing errors',
      kept: 'Visible for 7 days on our plan; Railway may keep them longer',
    },
    backups: {
      data: 'Backups: the database without sessions, encrypted',
      purpose: 'Recovery after a failure',
      kept: 'Daily copies 35 days, monthly copies 13 months',
    },
  },
  s1: {
    title: '1. Who is responsible',
    body: 'Richárd Bene, private individual, Hungary, <a>{{email}}</a>. Splinance is a personal project, invite-only and free; there is no business behind it.',
  },
  s2: {
    title: '2. What, why, on what basis, how long',
    body: 'Other members of a household see your display name, role and the shared entries, never your email. Private entries are visible only to you.',
  },
  s3: {
    title: '3. Signing in with Google',
    body: "If you choose it, Google sends us your Google account id, your email, whether Google verified it, and your name. We keep the id to recognize you; a new account takes the email and the name. We don't receive your picture, contacts or Google tokens, and we can't act in your Google account. Google acts as an independent controller and learns that you signed in to Splinance.",
  },
  s4: {
    title: '4. Who processes data for us',
    railway:
      'Railway: hosting and the database, in its EU West region (Amsterdam). Railway is a US company; transfers are covered by the EU Standard Contractual Clauses in its data processing addendum.',
    aws: 'Amazon Web Services: the encrypted backups, in Frankfurt. Only the controller holds the key to decrypt them.',
    cloudflare: "Cloudflare: the domain's DNS only, no personal data.",
    nothingSold: 'Nothing is sold, shared for advertising, or used to train AI models.',
  },
  s5: {
    title: '5. Cookies and storage',
    body: 'Only what signing in needs: the session cookie (30 days) and, during a Google sign-in, two short-lived cookies (10 minutes). Your browser also remembers the theme, the language, the last household you opened and your bank choice for imports. No analytics, no trackers, no third-party fonts or scripts, so there is no cookie banner.',
  },
  s6: {
    title: '6. Security',
    body: 'HTTPS everywhere, passwords hashed with Argon2id, database roles with the fewest rights they need, and backups encrypted before they leave the server.',
  },
  s7: {
    title: '7. Automated decisions',
    body: 'None, and no profiling. Category rules only do what you set them up to do.',
  },
  s8: {
    title: '8. Your rights',
    body: 'You can delete your account yourself in Account settings: your sign-in, name, email and private transactions are erased at once, and households only you were ever in are deleted. Shared entries stay for the other members, who need them for their balances, under "Former member" with nothing that identifies you. You can also ask for access to your data, its correction or deletion, restricted processing, a copy in a portable format, and object to processing based on legitimate interest. Write to the email above; requests are answered within one month. Deleted data leaves the backups as they expire.',
    complaint:
      'You can complain to the Hungarian data protection authority (NAIH, 1055 Budapest, Falk Miksa utca 9-11, ugyfelszolgalat@naih.hu, naih.hu) or go to court.',
  },
  s9: {
    title: '9. Other',
    body: 'Splinance is for people aged 16 and over. Changes to this notice appear on this page with a new date.',
  },
};
