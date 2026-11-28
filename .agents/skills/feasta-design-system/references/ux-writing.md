# FEASTA UX writing standard

Primary external reference (consult when accessible): https://vibe.monday.com/?path=/docs/foundations-ux-writing-handbook--docs

**Provenance:** The handbook page was not machine-readable during skill construction. These are independently composed FEASTA working rules, **not a direct quotation of Vibe's handbook**. When reading it later through your own browser/MCP, resolve differences carefully against product language and record any updated guidance.

## Voice
Plain, respectful, precise, actionable; no jargon, blame, hype or vague motivational language. Use FEASTA terms consistently: **Provider**, **Package**, **Event List**, **Booking request**, **Initial payment**, **Confirmed**, **Expired**, **Cancelled**, **Refund**, and document-context-specific labels. Never substitute "reservation" for "Event List" (the List does not hold capacity). Use consistent singular/plural counts, Manila-local date/time when displayed, and ₱ values with accurate fee breakdown.

## Microcopy contract
- Title answers *where am I?*; description answers *why does it matter?*; CTA answers *what happens next?*
- Name buttons by outcomes: `Review booking`, `Send booking request`, `Save availability`, `Try again` rather than repeated `Continue`, `Proceed`, `Submit` without context.
- Visible label is required for every input; examples and format hints supplement but never replace labels.
- Explain constraints before entry: eligible event dates, lead time, guest range, package state, deadlines, required verification, and any blocking availability limitation.
- Required/optional fields must be unambiguous and unnecessary input removed.
- Confirmation copy for irreversible action: action, consequence, final amount/date if relevant, explicit confirmation and safe cancel.
- Loading copy states what is being verified: `Checking availability…`, not an ambiguous permanent spinner.
- Empty state states why (if known) and what to do: `No requests for this date. Change the date or clear filters.`
- Success copy states **what changed** and where to find the result; don't imply payment confirmation before verified settlement.

## Error message pattern
`What happened + why (only when confidently known) + one corrective action + what is preserved.`

Examples, **illustrative only; confirm real policy with backend**:
- Poor: `Booking failed.` Better: `This provider has reached its booking capacity for December 12. Choose another date or provider. Your event details are saved.`
- Poor: `Invalid date.` Better: `Choose a date on or after the provider's earliest available day.`
- Poor: `Error 403.` Better: `You can't perform this action with your current account. Sign in with an authorized account or contact support.`
- Poor: `Something went wrong.` Better (unknown network): `We couldn't confirm this request. Check your connection and review its status before trying again to avoid duplicates.`

**Never invent reason, status, refund amount, deadline, provider rejection or availability that the server has not verified.** Don't expose exception stacks or identifiers to end users. Link errors to the specific field; summarize multiple errors near the top and focus the first invalid field for long forms. Show one next step rather than multiple competing CTA buttons.

## UX content QA
Can a user answer, without guessing: What do I need to enter? What rules apply? How far have I progressed? Will this cost money or reserve capacity? Why is this disabled? If an error occurs, did anything save? Where do I go now? What happens after this action? If no, fix copy and/or interaction, not just wording.
