import {missingRequiredFields,canTransition} from './policy.js';
describe('workflow policy',()=>{
 test('finds required fields missing from details',()=>{
  expect(missingRequiredFields({type:'move_in',details:{residentName:'A',unitNumber:'1'}},{requiredFields:{move_in:['residentName','unitNumber','plannedDate']}})).toEqual(['plannedDate']);
 });
 test('allows admin review from submitted',()=>expect(canTransition('submitted','under_review')).toBe(true));
 test('prevents direct approval from draft',()=>expect(canTransition('draft','approved')).toBe(false));
 test('prevents transition out of terminal status',()=>expect(canTransition('approved','under_review')).toBe(false));
});
