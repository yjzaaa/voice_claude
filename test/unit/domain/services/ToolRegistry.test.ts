import {
  ToolRegistry,
  ToolNotFoundError,
  ToolParameterError,
  ToolExecutionError,
} from '../../../../src/domain/services/ToolRegistry';

describe('ToolRegistry', () => {
  test('executes a registered tool and returns its result', async () => {
    const registry = new ToolRegistry();
    const tool = {
      name: 'greet',
      description: 'Greet someone',
      parameters: { type: 'object', properties: { name: { type: 'string' } } },
      risk: 'low' as const,
      execute: jest.fn().mockResolvedValue('hello alice'),
    };
    registry.register(tool);

    const result = await registry.execute('greet', { name: 'alice' });

    expect(tool.execute).toHaveBeenCalledWith({ name: 'alice' });
    expect(result).toBe('hello alice');
  });

  test('throws when executing an unknown tool', async () => {
    const registry = new ToolRegistry();

    await expect(registry.execute('missing', {})).rejects.toThrow(ToolNotFoundError);
  });

  test('validates parameters before executing the tool', async () => {
    const validate = jest.fn();
    const registry = new ToolRegistry(validate);
    const tool = {
      name: 'greet',
      description: 'Greet someone',
      parameters: { type: 'object', properties: { name: { type: 'string' } } },
      risk: 'low' as const,
      execute: jest.fn().mockResolvedValue('ok'),
    };
    registry.register(tool);

    await registry.execute('greet', { name: 'alice' });

    expect(validate).toHaveBeenCalledWith(tool.parameters, { name: 'alice' });
    expect(tool.execute).toHaveBeenCalled();
  });

  test('throws ToolParameterError when validation fails', async () => {
    const validate = jest.fn().mockImplementation(() => {
      throw new Error('name is required');
    });
    const registry = new ToolRegistry(validate);
    const tool = {
      name: 'greet',
      description: 'Greet someone',
      parameters: { type: 'object', properties: { name: { type: 'string' } } },
      risk: 'low' as const,
      execute: jest.fn(),
    };
    registry.register(tool);

    await expect(registry.execute('greet', {})).rejects.toThrow(ToolParameterError);
    expect(tool.execute).not.toHaveBeenCalled();
  });

  test('throws ToolExecutionError when tool execute fails', async () => {
    const registry = new ToolRegistry();
    const underlying = new Error('simulator unavailable');
    const tool = {
      name: 'greet',
      description: 'Greet someone',
      parameters: { type: 'object', properties: { name: { type: 'string' } } },
      risk: 'low' as const,
      execute: jest.fn().mockRejectedValue(underlying),
    };
    registry.register(tool);

    await expect(registry.execute('greet', { name: 'alice' })).rejects.toThrow(ToolExecutionError);
    await expect(registry.execute('greet', { name: 'alice' })).rejects.toThrow(/greet/);
  });
});
