'use client';

import { useCallback, useRef, useState } from 'react';
import {
  clockIn as apiClockIn,
  createRecord,
  createStaff as apiCreateStaff,
  deleteRecord as apiDeleteRecord,
  downloadRecordsCsv,
  fetchRecords,
  fetchStaff,
  updateRecord,
} from '@/lib/part-time-api';
import {
  EMPTY_ATTENDANCE_SUMMARY,
  type AttendanceRecord,
  type AttendanceSummary,
  type PartTimeStaff,
  type RecordQuery,
  type UpdateStaffInput,
} from '@/lib/part-time';

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

function upsert(list: PartTimeStaff[], next: PartTimeStaff, activeOnly: boolean): PartTimeStaff[] {
  const without = list.filter((row) => row.id !== next.id);
  if (activeOnly && !next.active) return without;
  return [...without, next].sort((a, b) => Number(a.id) - Number(b.id));
}

export function usePartTimeRecords() {
  const [staff, setStaff] = useState<PartTimeStaff[]>([]);
  const [directory, setDirectory] = useState<PartTimeStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary>(EMPTY_ATTENDANCE_SUMMARY);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [staffBusy, setStaffBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const staffGen = useRef(0);
  const recordsGen = useRef(0);
  const recordsLoaded = useRef(false);
  const queryRef = useRef<RecordQuery>({});

  const refreshStaff = useCallback(async () => {
    const gen = ++staffGen.current;
    const list = await fetchStaff(false);
    if (gen !== staffGen.current) return;
    setStaff(list);
  }, []);

  const loadDirectory = useCallback(async () => {
    const gen = ++staffGen.current;
    setDirectoryLoading(true);
    try {
      const list = await fetchStaff(true);
      if (gen !== staffGen.current) return;
      setDirectory(list);
      setStaff(list.filter((row) => row.active));
    } catch (err) {
      if (gen === staffGen.current) setError(messageOf(err));
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  const loadRecords = useCallback(async (query: RecordQuery) => {
    const gen = ++recordsGen.current;
    queryRef.current = query;
    if (!recordsLoaded.current) setRecordsLoading(true);
    try {
      const data = await fetchRecords(query);
      if (gen !== recordsGen.current) return;
      recordsLoaded.current = true;
      setRecords(data.records);
      setSummary(data.summary);
      setTruncated(data.truncated);
    } catch (err) {
      if (gen !== recordsGen.current) return;
      setError(messageOf(err));
    } finally {
      if (gen === recordsGen.current) setRecordsLoading(false);
    }
  }, []);

  const reloadRecords = useCallback(() => {
    if (!recordsLoaded.current) return Promise.resolve();
    return loadRecords(queryRef.current);
  }, [loadRecords]);

  const bootStaff = useCallback(() => {
    setStaffLoading(true);
    refreshStaff()
      .catch((err) => setError(messageOf(err)))
      .finally(() => setStaffLoading(false));
  }, [refreshStaff]);

  const clockIn = useCallback(async (staffId: string) => {
    staffGen.current += 1;
    setBusyId(staffId);
    setError('');
    try {
      const next = await apiClockIn(staffId);
      setStaff((prev) => upsert(prev, next, true));
      setDirectory((prev) => (prev.length ? upsert(prev, next, false) : prev));
      return true;
    } catch (err) {
      setError(messageOf(err));
      refreshStaff().catch(() => undefined);
      return false;
    } finally {
      setBusyId(null);
    }
  }, [refreshStaff]);

  const clockOut = useCallback(async (staffId: string, signatureBase64: string) => {
    staffGen.current += 1;
    setBusyId(staffId);
    setError('');
    try {
      await createRecord(staffId, signatureBase64);
      setStaff((prev) => prev.map((row) => (
        row.id === staffId ? { ...row, isClockedIn: false, currentClockInTime: undefined } : row
      )));
      setDirectory((prev) => prev.map((row) => (
        row.id === staffId ? { ...row, isClockedIn: false, currentClockInTime: undefined } : row
      )));
      await reloadRecords();
      return true;
    } catch (err) {
      setError(messageOf(err));
      refreshStaff().catch(() => undefined);
      return false;
    } finally {
      setBusyId(null);
    }
  }, [refreshStaff, reloadRecords]);

  const createStaff = useCallback(async (input: { name: string; hourlyRate: number }) => {
    staffGen.current += 1;
    setStaffBusy(true);
    setError('');
    try {
      const next = await apiCreateStaff(input);
      setStaff((prev) => upsert(prev, next, true));
      setDirectory((prev) => upsert(prev, next, false));
      await loadDirectory();
      return next;
    } catch (err) {
      setError(messageOf(err));
      return null;
    } finally {
      setStaffBusy(false);
    }
  }, [loadDirectory]);

  const updateStaff = useCallback(async (id: string, patch: UpdateStaffInput) => {
    staffGen.current += 1;
    setStaffBusy(true);
    setError('');
    try {
      const next = await updateRecord(id, patch);
      setStaff((prev) => upsert(prev, next, true));
      setDirectory((prev) => upsert(prev, next, false));
      await loadDirectory();
      return next;
    } catch (err) {
      setError(messageOf(err));
      return null;
    } finally {
      setStaffBusy(false);
    }
  }, [loadDirectory]);

  const removeRecord = useCallback(async (id: string) => {
    if (!window.confirm('刪除這筆出勤紀錄？Delete this attendance record?')) return;
    setDeletingId(id);
    setError('');
    try {
      await apiDeleteRecord(id);
      setRecords((prev) => prev.filter((row) => row.id !== id));
      await reloadRecords();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setDeletingId(null);
    }
  }, [reloadRecords]);

  const exportCsv = useCallback(async (query: RecordQuery) => {
    setExporting(true);
    setError('');
    try {
      await downloadRecordsCsv(query);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setExporting(false);
    }
  }, []);

  return {
    staff,
    directory,
    staffLoading,
    directoryLoading,
    records,
    summary,
    recordsLoading,
    truncated,
    busyId,
    staffBusy,
    deletingId,
    exporting,
    error,
    bootStaff,
    refreshStaff,
    loadDirectory,
    loadRecords,
    clockIn,
    clockOut,
    createStaff,
    updateStaff,
    removeRecord,
    exportCsv,
    clearError: () => setError(''),
  };
}
