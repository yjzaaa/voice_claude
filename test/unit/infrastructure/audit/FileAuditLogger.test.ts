import { FileAuditLogger } from '../../../../src/infrastructure/audit/FileAuditLogger';
import { AuditEntry } from '../../../../src/ports/outgoing/AuditLogger';

describe('FileAuditLogger', () => {
  const makeFs = () => {
    const lines: string[] = [];
    return {
      existsSync: jest.fn().mockReturnValue(true),
      mkdirSync: jest.fn(),
      appendFileSync: jest.fn().mockImplementation((_path: string, line: string) => {
        lines.push(line.trim());
      }),
      getLines: () => lines,
    };
  };

  const entry = (text: string): AuditEntry => ({
    timestamp: 123,
    triggerText: text,
    response: { isCommand: true, confidence: 0.9 },
    executionResult: { status: 'success' },
  });

  test('appends a JSON line to the log file', () => {
    const fs = makeFs();
    const logger = new FileAuditLogger('/tmp/audit.jsonl', fs as any);

    logger.log(entry('hello'));

    expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
    const line = fs.getLines()[0];
    expect(JSON.parse(line).triggerText).toBe('hello');
  });

  test('creates the log directory if it does not exist', () => {
    const fs = makeFs();
    fs.existsSync.mockReturnValue(false);
    const logger = new FileAuditLogger('/tmp/logs/audit.jsonl', fs as any);

    logger.log(entry('hi'));

    expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/logs', { recursive: true });
  });

  test('appends multiple entries as separate lines', () => {
    const fs = makeFs();
    const logger = new FileAuditLogger('/tmp/audit.jsonl', fs as any);

    logger.log(entry('a'));
    logger.log(entry('b'));

    expect(fs.getLines()).toHaveLength(2);
  });
});
