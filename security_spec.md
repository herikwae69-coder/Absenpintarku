# Security Specification: Absensi Pintar

## Data Invariants
1. **Employees:** Must have a unique name and a valid PIN (4-6 digits). Role must be either 'admin' or 'employee'.
2. **Shifts:** Must have valid start/end/break times in HH:mm format.
3. **Attendance:** Each record belongs to a specific employee for a specific date. Cannot record a checkout without a check-in.

## The "Dirty Dozen" Payloads (Red Team Test Cases)
1. **Identity Spoofing:** Creating an attendance record for another employee.
2. **Role Escalation:** A regular employee trying to change their role to 'admin'.
3. **PIN Theft:** An unauthenticated user reading the `employees` collection to find PINs.
4. **Time Manipulation:** Manually setting `checkIn` to a past time via the console.
5. **Duplicate Attendance:** Creating multiple attendance records for the same employee on the same date.
6. **Orphaned Writes:** Adding attendance for a non-existent employee ID.
7. **Shift Deletion:** A non-admin trying to delete work shifts.
8. **Live View Scraping:** A regular employee trying to read other people's live attendance logs.
9. **Admin Password Bypass:** Accessing the admin dashboard data directly via Firestore without knowledge of the PIN/Password.
10. **Shadow Fields:** Adding hidden meta-data to an employee record (e.g., `isVerified: true`).
11. **ID Poisoning:** Using a 1MB string as a document ID to induce cost/errors.
12. **Status Skipping:** Changing status from 'absent' to 'present' without a valid `checkIn` timestamp.

## The Test Runner Strategy
We will use Firestore Security Rules to enforce these invariant checks. 
- `read` on `employees` will be restricted to authenticated users.
- `create/update` on `employees` will be restricted to administrative users.
- `attendance` reads will be restricted to owners or admins.

## Proposed Rules Structure
1. `isValidEmployee(data)` helper.
2. `isValidAttendance(data)` helper.
3. `isAdmin()` check based on employee role attribute.
