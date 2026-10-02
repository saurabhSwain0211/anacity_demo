export const TERMINAL_STATUSES = new Set(['approved', 'rejected']);
export const ALLOWED_ADMIN_STATUSES = new Set(['under_review', 'needs_information', 'approved', 'rejected']);

export function missingRequiredFields(request, rules = {}) {
  const fields = rules.requiredFields?.[request.type] ?? [
    'residentName', 'unitNumber', 'plannedDate', 'phone'
  ];
  return fields.filter((field) => {
    const value = request.details?.[field] ?? request[field];
    return value === undefined || value === null || String(value).trim() === '';
  });
}

export function canTransition(current, next) {
  const allowed = {
    draft: ['submitted'],
    submitted: ['under_review', 'needs_information'],
    under_review: ['needs_information', 'approved', 'rejected'],
    needs_information: ['submitted', 'under_review'],
    approved: [],
    rejected: []
  };
  return (allowed[current] ?? []).includes(next);
}
