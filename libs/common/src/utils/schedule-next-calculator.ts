import { CronExpressionParser } from 'cron-parser';

export interface ScheduleNextInput {
  cronExpression?: string | null;
  daysOfWeek?: number[];
  timeOfDay?: string | null;
  timezone?: string;
}

/**
 * Tính toán thời điểm thực thi tiếp theo của một schedule.
 * Dùng chung giữa AutomationService (core-api) và ScheduleCronService (worker-service).
 *
 * @returns Date nếu tính được, null nếu không có lịch hợp lệ
 */
export function calculateNextExecution(
  input: ScheduleNextInput,
  from: Date = new Date(),
): Date | null {
  const tz = input.timezone ?? 'Asia/Ho_Chi_Minh';

  // 1. Ưu tiên cron expression
  if (input.cronExpression) {
    try {
      const interval = CronExpressionParser.parse(
        input.cronExpression,
        { tz, currentDate: from },
      );
      return interval.next().toDate();
    } catch {
      return null;
    }
  }

  // 2. daysOfWeek + timeOfDay (format "HH:mm")
  if (input.daysOfWeek && input.daysOfWeek.length > 0 && input.timeOfDay) {
    const [hour, minute] = input.timeOfDay.split(':').map(Number);
    if (isNaN(hour) || isNaN(minute)) return null;

    const candidate = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate(),
      hour,
      minute,
      0,
      0,
    );

    // Tìm ngày hợp lệ trong 7 ngày tới khớp với daysOfWeek
    for (let i = 1; i <= 7; i++) {
      const testDate = new Date(candidate.getTime() + i * 24 * 60 * 60 * 1000);
      if (input.daysOfWeek.includes(testDate.getDay()) && testDate > from) {
        return testDate;
      }
    }
  }

  return null;
}
