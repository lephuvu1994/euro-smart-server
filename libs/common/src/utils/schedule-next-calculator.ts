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

    const daysStr = input.daysOfWeek.join(',');
    const cronStr = `${minute} ${hour} * * ${daysStr}`;

    try {
      const interval = CronExpressionParser.parse(
        cronStr,
        { tz, currentDate: from },
      );
      return interval.next().toDate();
    } catch {
      return null;
    }
  }

  return null;
}
