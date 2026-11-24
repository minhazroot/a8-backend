import test from 'node:test';
import assert from 'node:assert/strict';
import { slots, registerSchema, bookingSchema, studioSchema } from '../src/validation.js';

test('15-minute booking slots use half-open intervals', () => {
  assert.deepEqual(slots('10:00', '11:00'), [600,615,630,645]);
  assert.equal(slots('11:00', '10:00'), null);
  assert.equal(slots('10:05', '11:00'), null);
  assert.equal(slots('10:00', '10:00'), null);
});

test('registration enforces uppercase, lowercase and length', () => {
  const profile = { name:'Test Creator', email:'TEST@example.com', photo:'' };
  assert.equal(registerSchema.safeParse({...profile,password:'lowercase8'}).success, false);
  assert.equal(registerSchema.safeParse({...profile,password:'UPPERCASE8'}).success, false);
  assert.equal(registerSchema.safeParse({...profile,password:'Ab1'}).success, false);
  assert.equal(registerSchema.safeParse({...profile,password:'ValidPass123'}).success, true);
});

test('booking request validates date and time fields', () => {
  assert.equal(bookingSchema.safeParse({studioId:'123',date:'2027-01-01',start:'10:00',end:'12:00'}).success,true);
  assert.equal(bookingSchema.safeParse({studioId:'123',date:'bad-date',start:'10:00',end:'12:00'}).success,false);
});

test('studio requires positive pricing and valid photo URL', () => {
  const studio={title:'Great Creative Studio',category:'Photo Studio',rate:95,deposit:25,capacity:5,location:'Brooklyn, NY',image:'https://example.com/photo.jpg',gallery:['https://example.com/photo.jpg'],amenities:['Wi-Fi'],overview:'Bright well equipped studio for portrait photography.'};
  assert.equal(studioSchema.safeParse(studio).success,true);
  assert.equal(studioSchema.safeParse({...studio,rate:-2}).success,false);
});
