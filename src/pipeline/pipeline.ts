/**
 * Pipeline 编排器
 */
import { Config } from '../config';
import { InstanceRegistry } from '../instance/registry';
import { LLMRouter } from '../instance/router';
import { AudioCollector } from './collector';
import { PromptEnhancer } from './enhancer';
import { DeliveryWorker } from './delivery';

export class Pipeline {
  private collector: AudioCollector;
  private enhancer: PromptEnhancer;
  private delivery: DeliveryWorker;
  private registry: InstanceRegistry;
  private router: LLMRouter;

  private collected = 0; private enhanced = 0;

  constructor(config: Config) {
    this.registry = new InstanceRegistry();
    this.router = new LLMRouter(this.registry, config);
    this.collector = new AudioCollector();
    this.enhancer = new PromptEnhancer(config);
    this.delivery = new DeliveryWorker(this.router);

    // 管线: collector → enhancer → delivery
    this.collector.on('text', async (raw: string) => {
      this.collected++;
      if (this.collector.isDuplicate(raw)) return;
      const enhanced = await this.enhancer.enhance(raw);
      this.enhanced++;
      this.delivery.feed(enhanced);
    });
  }

  start() { this.registry.scan(); }

  /** 渲染进程 IPC 投喂 */
  feed(text: string) { this.collector.feed(text); }

  stop() { this.delivery = null!; }

  stats() {
    return {
      collected: this.collected,
      enhanced: this.enhanced,
      delivered: this.delivery.count(),
    };
  }
}
