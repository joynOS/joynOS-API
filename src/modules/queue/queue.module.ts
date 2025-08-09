import { Module, OnModuleInit, forwardRef, Injectable, Inject } from '@nestjs/common'
import IORedis from 'ioredis'
import { Queue, Worker } from 'bullmq'
import { EventsService } from '../events/events.service'
import { EventsModule } from '../events/events.module'

export const connection = new IORedis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null as any,
  enableReadyCheck: false,
})

export class VotingQueueService {
  private readonly queue = new Queue('voting', { connection })
  async addCloseJob(eventId: string, delayMs: number) {
    await this.queue.add('close', { eventId }, { delay: delayMs })
  }
}

@Injectable()
export class VotingWorker implements OnModuleInit {
  constructor(@Inject(forwardRef(() => EventsService)) private readonly eventsService: EventsService) {}
  async onModuleInit() {
    new Worker(
      'voting',
      async (job) => {
        if (job.name === 'close') {
          const eventId = job.data.eventId as string
          await this.eventsService.closeVoting(eventId)
        }
      },
      { connection },
    )
  }
}

@Module({ imports: [forwardRef(() => EventsModule)], providers: [VotingQueueService, VotingWorker], exports: [VotingQueueService] })
export class QueueModule {}
