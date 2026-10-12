/**
 * Everything that is specific to the chosen corpus lives here, so switching
 * documents means editing this one file (plus re-seeding).
 */
export const CORPUS = {
  /** Full name — stored in chunk metadata and used in embedded headings */
  name: 'Handbook on Workers’ Statutory Monetary Benefits (2024 Edition, DOLE Bureau of Working Conditions)',
  appTitle: 'Workers’ Benefits Guide',
  tagline: 'Ask about Philippine workers’ wages, leaves, and statutory benefits. Answers cite the handbook.',
  metaDescription:
    'Ask questions about the DOLE Handbook on Workers’ Statutory Monetary Benefits (2024 Edition). Answers are grounded in the handbook and cite the chapter and section.',
  emptyTitle: 'What would you like to know?',
  emptyBody:
    'I search DOLE’s 2024 Handbook on Workers’ Statutory Monetary Benefits and answer only from what I find, with citations you can check. If it isn’t in the handbook, I’ll say so.',
  inputPlaceholder: 'Ask about holiday pay, leaves, 13th-month pay, SSS…',
  disclaimer:
    'Information only, not legal advice. Based on the 2024 handbook — rates and rules change, so confirm with DOLE (Hotline 1349).',
  /** What the tool description tells the model it can search */
  topics:
    'minimum wage, holiday pay, premium pay, overtime pay, night shift differential, service charges, ' +
    'leaves (service incentive, maternity, paternity, solo parent, VAWC, special leave for women), ' +
    '13th-month pay, separation pay, retirement pay, and ECC, PhilHealth, SSS and Pag-IBIG benefits',
  /** Example of a citation label as it appears in answers */
  citationExample: 'Maternity Leave, C. Duration',
  /** Extra numbered rules appended to the system prompt */
  extraRules: [
    'Amounts, rates and contribution tables are as of the 2024 edition of the handbook; say so when you quote them. ' +
      'Where the handbook itself defers to an official source (for example the NWPC website for current regional wage rates), point the user to it instead of guessing a figure.',
  ],
  suggestions: [
    'How many days of maternity leave is a female employee entitled to?',
    'How is holiday pay computed for a regular holiday?',
    'Who is not entitled to service incentive leave?',
    'How is 13th-month pay computed and when is it due?',
    'What is the night shift differential rate?',
    'How much separation pay is due for an authorized cause?',
  ],

  /** Which parser to use: 'statute' (Articles/Chapters + Sections) or 'handbook' (numbered chapters + A., B., C.) */
  format: 'handbook' as 'statute' | 'handbook',
  /** Options for the handbook parser (see lib/parse-handbook.ts) */
  handbook: {
    unnumberedChapters: ['COMPLIANCE GUIDE'],
    // Everything from the office directories onward is dropped: those pages are two-column
    // grids that extract with phone numbers/emails detached from the right region.
    stopAtHeadings: ['DIRECTORY OF DOLE REGIONAL OFFICES'],
    // The Compliance Guide opens with a ✓ / N/A matrix whose columns extract scrambled → would mislead.
    // Drop that intro, keep the pay-multiplier table that follows ("A. Guide Computations…").
    dropChapterIntro: ['Compliance Guide'],
    // A multi-column summary table that duplicates chapters 7–12 and extracts jumbled.
    excludeSectionTitles: [/Summary of Statutory Leave Benefits/i],
  },
};

/** Name of the retrieval tool exposed to the model (also read by the UI). */
export const SEARCH_TOOL = 'searchDocument';
