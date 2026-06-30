import { CronScheduler } from '../../../../src/infrastructure/scheduler/CronScheduler';

describe('CronScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('runs a job every 5 seconds for */5 cron expression', () => {
    jest.setSystemTime(new Date('2026-06-30T00:00:05.000Z'));
    const cb = jest.fn();
    const scheduler = new CronScheduler();
    scheduler.schedule('*/5 * * * * *', cb);
    scheduler.start();

    jest.advanceTimersByTime(1000);
    expect(cb).not.toHaveBeenCalled();

    jest.advanceTimersByTime(4000);
    expect(cb).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5000);
    expect(cb).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  test('runs a job at a specific second', () => {
    jest.setSystemTime(new Date('2026-06-30T00:00:00.000Z'));
    const cb = jest.fn();
    const scheduler = new CronScheduler();
    scheduler.schedule('3 * * * * *', cb);
    scheduler.start();

    jest.advanceTimersByTime(3000);
    expect(cb).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  test('stops firing jobs after stop is called', () => {
    jest.setSystemTime(new Date('2026-06-30T00:00:00.000Z'));
    const cb = jest.fn();
    const scheduler = new CronScheduler();
    scheduler.schedule('*/1 * * * * *', cb);
    scheduler.start();

    jest.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);

    scheduler.stop();
    jest.advanceTimersByTime(2000);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
