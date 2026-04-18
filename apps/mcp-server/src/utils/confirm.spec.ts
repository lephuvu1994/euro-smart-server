import * as crypto from 'crypto';
import * as i18n from './i18n';
import {
    createOrExecuteAction,
    createPendingAction,
    executeConfirmedAction,
    listPendingActions,
} from './confirm';

jest.mock('./i18n', () => ({
    t: jest.fn().mockImplementation((lang, key, params) => {
        return `${lang}:${key}:${params ? JSON.stringify(params) : ''}`;
    }),
}));

describe('Confirm Utility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const extractId = (res: string) => {
        const jsonStr = res.substring(res.indexOf('{'));
        return JSON.parse(jsonStr).id;
    };

    describe('createOrExecuteAction', () => {
        it('should execute action immediately if userId is provided (End-User flow)', async () => {
            const action = jest.fn().mockResolvedValue({ status: 'OK' });
            const result = await createOrExecuteAction('vi', 'Test Action', action, 'user-123');

            expect(action).toHaveBeenCalled();
            expect(result).toContain('vi:confirm.success');
            expect(result).toContain('OK');
        });

        it('should return error gracefully if immediate action fails', async () => {
            const action = jest.fn().mockRejectedValue(new Error('Action crashed'));
            const result = await createOrExecuteAction('en', 'Test Action', action, 'user-123');

            expect(action).toHaveBeenCalled();
            expect(result).toContain('en:confirm.error');
            expect(result).toContain('Action crashed');
        });

        it('should create pending action and NOT execute if userId is absent (Admin flow)', async () => {
            const action = jest.fn().mockResolvedValue('OK');

            const result = await createOrExecuteAction('vi', 'Admin Action', action);

            expect(action).not.toHaveBeenCalled();
            expect(result).toContain('vi:confirm.title');
            expect(result).toMatch(/"id":".{8}"/);
        });
    });

    describe('createPendingAction (deprecated)', () => {
        it('should create pending action', () => {
            const action = jest.fn();

            const result = createPendingAction('en', 'Deprecated action', action);

            expect(action).not.toHaveBeenCalled();
            expect(result).toContain('en:confirm.title');
            expect(result).toMatch(/"id":".{8}"/);
        });
    });

    describe('executeConfirmedAction', () => {
        it('should return expired message if pendingId does not exist', async () => {
            const result = await executeConfirmedAction('non-existent');
            expect(result).toContain('vi:confirm.expired');
        });

        it('should execute pending action and delete it from map', async () => {
            const action = jest.fn().mockResolvedValue({ status: 'Success' });

            const req = await createOrExecuteAction('en', 'Pending Action to exec', action);
            const id = extractId(req);

            const result = await executeConfirmedAction(id);

            expect(action).toHaveBeenCalled();
            expect(result).toContain('en:confirm.success');
            expect(result).toContain('Success');

            // Secondary check to ensure it's deleted
            const secondTry = await executeConfirmedAction(id);
            expect(secondTry).toContain('vi:confirm.expired');
        });

        it('should return error message if action throws error', async () => {
            const action = jest.fn().mockRejectedValue(new Error('Crash execution'));

            const req = await createOrExecuteAction('vi', 'Pending Action to crash', action);
            const id = extractId(req);

            const result = await executeConfirmedAction(id);

            expect(action).toHaveBeenCalled();
            expect(result).toContain('vi:confirm.error');
            expect(result).toContain('Crash execution');
        });
    });

    describe('listPendingActions', () => {
        it('should return empty if no pending actions', () => {
            jest.advanceTimersByTime(5 * 60 * 1000 + 1000);
            listPendingActions('vi');

            const result = listPendingActions('vi');
            expect(result).toContain('vi:confirm.empty');
        });

        it('should list active pending actions', async () => {
            jest.advanceTimersByTime(5 * 60 * 1000 + 1000);
            listPendingActions('vi');

            const action = jest.fn();

            const req1 = await createOrExecuteAction('vi', 'Task 1', action);
            const req2 = await createOrExecuteAction('vi', 'Task 2', action);
            const id1 = extractId(req1);
            const id2 = extractId(req2);

            const result = listPendingActions('en');
            expect(result).toContain('en:confirm.list');
            expect(result).toContain(`- \`${id1}\`: Task 1`);
            expect(result).toContain(`- \`${id2}\`: Task 2`);
        });
    });

    describe('cleanExpired mechanism', () => {
        it('should delete expired actions after 5 mins', async () => {
            const action = jest.fn();
            const req = await createOrExecuteAction('vi', 'Task to expire', action);
            const id = extractId(req);

            // Advance by 5 mins + 1 ms
            jest.advanceTimersByTime(5 * 60 * 1000 + 1);

            // Action should be cleaned by next call
            const execResult = await executeConfirmedAction(id);
            expect(execResult).toContain('confirm.expired');
        });
    });
});
