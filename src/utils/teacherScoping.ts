/**
 * Utility functions for scoping teacher data in Speak Hub Mobile
 * Ensures teachers only see their assigned batches and students belonging to those batches.
 */

export interface TeacherUser {
  id?: string;
  uid?: string;
  role?: string;
  batchIds?: string[];
  batchId?: string;
  [key: string]: any;
}

/**
 * Resolves the full set of batch IDs assigned to a teacher.
 * Combines:
 * 1. user.batchIds and user.batchId from the teacher's profile
 * 2. Batches where batch.teacherId matches user.id / user.uid
 * 3. Batches where batch.teacherIds includes user.id / user.uid
 */
export function getTeacherAssignedBatchSet(user: TeacherUser | null | undefined, allBatches: any[]): Set<string> {
  const assigned = new Set<string>();
  if (!user) return assigned;

  const teacherId = String(user.id || user.uid || '').trim();

  // 1. Check profile batchIds
  if (Array.isArray(user.batchIds)) {
    user.batchIds.forEach((bId) => {
      if (bId && typeof bId === 'string' && bId.trim()) {
        assigned.add(bId.trim());
      }
    });
  }
  if (user.batchId && typeof user.batchId === 'string' && user.batchId.trim()) {
    assigned.add(user.batchId.trim());
  }

  // 2. Check batches where teacher is listed as instructor
  if (allBatches && Array.isArray(allBatches)) {
    allBatches.forEach((b) => {
      const bId = String(b.id || b.documentId || '').trim();
      const tId = String(b.teacherId || '').trim();
      const tIds = Array.isArray(b.teacherIds) ? b.teacherIds.map((id: any) => String(id).trim()) : [];

      if (teacherId && (tId === teacherId || tIds.includes(teacherId))) {
        if (bId) assigned.add(bId);
      }
    });
  }

  return assigned;
}

/**
 * Determines whether a student belongs to one of the teacher's assigned batches.
 */
export function isStudentInTeacherBatches(student: any, assignedBatchIds: Set<string>): boolean {
  if (!student || assignedBatchIds.size === 0) return false;

  const sBatches: string[] = [];
  if (Array.isArray(student.batchIds)) {
    student.batchIds.forEach((id: any) => {
      if (id) sBatches.push(String(id).trim());
    });
  }
  if (student.batchId) {
    sBatches.push(String(student.batchId).trim());
  }

  return sBatches.some((bId) => assignedBatchIds.has(bId));
}

/**
 * Filters a list of batches for the logged-in user.
 * If user is a teacher, returns only assigned batches.
 * If user is superadmin, returns all batches.
 */
export function filterBatchesForTeacher(allBatches: any[], user: TeacherUser | null | undefined): any[] {
  if (!allBatches || !Array.isArray(allBatches)) return [];
  if (!user) return [];

  // Superadmin gets global access; teachers are strictly isolated
  if (user.role === 'admin') {
    return allBatches;
  }

  const assignedSet = getTeacherAssignedBatchSet(user, allBatches);
  return allBatches.filter((b) => {
    const bId = String(b.id || b.documentId || '').trim();
    return assignedSet.has(bId);
  });
}

/**
 * Filters a list of students for the logged-in user.
 * If user is a teacher, returns only students enrolled in assigned batches.
 */
export function filterStudentsForTeacher(allStudents: any[], assignedBatchIds: Set<string>, user: TeacherUser | null | undefined): any[] {
  if (!allStudents || !Array.isArray(allStudents)) return [];
  if (!user) return [];

  // Superadmin gets global access; teachers are strictly isolated
  if (user.role === 'admin') {
    return allStudents;
  }

  return allStudents.filter((student) => isStudentInTeacherBatches(student, assignedBatchIds));
}
