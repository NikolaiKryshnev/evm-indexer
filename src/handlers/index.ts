import * as dispatcher from '../abi/dispatcher'
import { Contract } from '../abi/dispatcher'
import * as uch from '../abi/uch'
import * as fee from '../abi/fee'
import { topics } from '../utils/topics'
import { Context } from '../utils/types'
import {
  ackPacketHook,
  handleAcknowledgement,
  handleRecvPacket,
  handleSendPacket,
  handleTimeout,
  handleWriteAckPacket,
  handleWriteTimeoutPacket,
  packetMetrics,
  packetSourceChannelUpdate,
  recvPacketHook,
  sendPacketHook,
  writeAckPacketHook
} from './packets'
import {
  ackChannelHook,
  channelMetrics,
  confirmChannelHook,
  createChannelInInitState,
  createChannelInTryState,
  handleChannelOpenAck,
  handleChannelOpenConfirm,
  handleChannelOpenInit,
  handleChannelOpenTry
} from './channels'
import {
  Acknowledgement,
  Channel,
  ChannelOpenAck,
  ChannelOpenConfirm,
  ChannelOpenInit,
  ChannelOpenTry,
  CloseIbcChannel,
  OpenChannelFeeDeposited,
  RecvPacket,
  SendPacket,
  SendPacketFeeDeposited,
  Timeout,
  WriteAckPacket,
  WriteTimeoutPacket
} from '../model';
import { handleOpenChannelFee, handleSendPacketFee } from './fees';
import { Entity } from '@subsquid/typeorm-store/lib/store';

export enum StatName {
  SendPacket = 'SendPacket',
  RecvPacket = 'RecvPacket',
  AckPacket = 'AckPacket',
  WriteAckPacket = 'WriteAckPacket',
  WriteTimeoutPacket = 'WriteTimeoutPacket',
  Timeout = 'Timeout',
  OpenInitChannel = 'OpenInitChannel',
  OpenTryChannel = 'OpenTryChannel',
  OpenAckChannel = 'OpenAckChannel',
  OpenConfirmChannel = 'OpenConfirmChannel',
  CloseChannel = 'CloseChannel',
}

type Entities = {
  openInitIbcChannels: ChannelOpenInit[],
  openTryIbcChannels: ChannelOpenTry[],
  openAckIbcChannels: ChannelOpenAck[],
  openConfirmIbcChannels: ChannelOpenConfirm[],
  closeIbcChannels: CloseIbcChannel[],
  channels: Channel[],
  sendPackets: SendPacket[],
  writeAckPackets: WriteAckPacket[],
  recvPackets: RecvPacket[],
  acknowledgements: Acknowledgement[],
  timeouts: Timeout[],
  writeTimeoutPackets: WriteTimeoutPacket[],
  sendPacketFees: SendPacketFeeDeposited[],
  openChannelFees: OpenChannelFeeDeposited[],
}

const portPrefixCache = new Map<string, string>();

export async function handler(ctx: Context) {
  const entities: Entities = {
    openInitIbcChannels: [],
    openTryIbcChannels: [],
    openAckIbcChannels: [],
    openConfirmIbcChannels: [],
    closeIbcChannels: [],
    channels: [],
    sendPackets: [],
    writeAckPackets: [],
    recvPackets: [],
    acknowledgements: [],
    timeouts: [],
    writeTimeoutPackets: [],
    sendPacketFees: [],
    openChannelFees: [],
  };

  const uchPacketSends = new Map<string, string>();

  for (let block of ctx.blocks) {
    for (let log of block.logs) {

      const currTopic = log.topics[0]
      if (!topics.includes(currTopic)) continue

      // UCH Packet Sent
      if (currTopic === uch.events.UCHPacketSent.topic) {
        const transactionHash = log.transactionHash
        const source = uch.events.UCHPacketSent.decode(log).source
        uchPacketSends.set(transactionHash, source)
        continue
      }

      // Packet events
      if ([
        dispatcher.events.SendPacket.topic,
        dispatcher.events.RecvPacket.topic,
        dispatcher.events.WriteAckPacket.topic,
        dispatcher.events.Acknowledgement.topic,
        dispatcher.events.Timeout.topic,
        dispatcher.events.WriteTimeoutPacket.topic,
        dispatcher.events.ChannelOpenInit.topic,
        dispatcher.events.ChannelOpenTry.topic,
        dispatcher.events.ChannelOpenAck.topic,
        dispatcher.events.ChannelOpenConfirm.topic
      ].includes(currTopic)) {
        let portPrefix = portPrefixCache.get(log.address)
        if (!portPrefix) {
          // Get the port prefix from the last block in case the port prefix hasn't been properly set in the beginning
          let latestHeight = Number(await ctx._chain.client.call('eth_blockNumber', ['latest']))
          const contract = new Contract(ctx, {height: latestHeight}, log.address)
          portPrefix = String(await contract.portPrefix())
          portPrefixCache.set(log.address, portPrefix)
        }

        // Packet events
        if (currTopic === dispatcher.events.SendPacket.topic) {
          entities.sendPackets.push(handleSendPacket(block.header, log, portPrefix, uchPacketSends.get(log.transactionHash) || ''))
        } else if (currTopic === dispatcher.events.RecvPacket.topic) {
          entities.recvPackets.push(handleRecvPacket(block.header, log, portPrefix))
        } else if (currTopic === dispatcher.events.WriteAckPacket.topic) {
          entities.writeAckPackets.push(handleWriteAckPacket(block.header, log, portPrefix))
        } else if (currTopic === dispatcher.events.Acknowledgement.topic) {
          entities.acknowledgements.push(handleAcknowledgement(block.header, log, portPrefix))
        } else if (currTopic === dispatcher.events.Timeout.topic) {
          entities.timeouts.push(handleTimeout(block.header, log, portPrefix))
        } else if (currTopic === dispatcher.events.WriteTimeoutPacket.topic) {
          entities.writeTimeoutPackets.push(handleWriteTimeoutPacket(block.header, log, portPrefix))
        }

        // Channel events
        else if (currTopic === dispatcher.events.ChannelOpenInit.topic) {
          entities.openInitIbcChannels.push(handleChannelOpenInit(portPrefix, block.header, log))
        } else if (currTopic === dispatcher.events.ChannelOpenTry.topic) {
          entities.openTryIbcChannels.push(handleChannelOpenTry(block.header, log))
        } else if (currTopic === dispatcher.events.ChannelOpenAck.topic) {
          entities.openAckIbcChannels.push(handleChannelOpenAck(block.header, log))
        } else if (currTopic === dispatcher.events.ChannelOpenConfirm.topic) {
          entities.openConfirmIbcChannels.push(handleChannelOpenConfirm(block.header, log))
        }
      }

      // fee events
      else if (currTopic === fee.events.SendPacketFeeDeposited.topic) {
        entities.sendPacketFees.push(handleSendPacketFee(block.header, log))
      } else if (currTopic === fee.events.OpenChannelFeeDeposited.topic) {
        entities.openChannelFees.push(handleOpenChannelFee(block.header, log))
      }
    }
  }

  await upsertNewEntities(ctx, entities);
  await postBlockChannelHook(ctx, entities);
  await postBlockPacketHook(ctx, entities);
}

export async function postBlockChannelHook(ctx: Context, entities: Entities) {
  const uniqueChannelIds = new Set<string>();

  let channelUpdates: Channel[] = []
  let initChannels = entities.openInitIbcChannels.map(channelOpenInit => createChannelInInitState(channelOpenInit, ctx));
  let openTryChannels = entities.openTryIbcChannels.map(channelOpenTry => createChannelInTryState(channelOpenTry, ctx));
  channelUpdates.push(...initChannels, ...openTryChannels);
  await ctx.store.upsert(channelUpdates);

  initChannels.forEach(channel => uniqueChannelIds.add(channel.id));
  openTryChannels.forEach(channel => uniqueChannelIds.add(channel.id));

  channelUpdates = []
  let channelEventUpdates: Entity[] = []
  for (let channelOpenAck of entities.openAckIbcChannels) {
    let {cpChannel, channelOpenInit} = await ackChannelHook(channelOpenAck, ctx)
    if (cpChannel) {
      channelUpdates.push(cpChannel)
    }
    if (channelOpenInit) {
      channelEventUpdates.push(channelOpenInit)
    }
  }

  channelUpdates = uniqueByLastOccurrence(channelUpdates);
  channelEventUpdates = uniqueByLastOccurrence(channelEventUpdates);

  await ctx.store.upsert(channelUpdates)
  await ctx.store.upsert(channelEventUpdates)

  channelUpdates = []
  for (let channelOpenConfirm of entities.openConfirmIbcChannels) {
    let confirmedChannels = await confirmChannelHook(channelOpenConfirm, ctx);
    channelUpdates.push(...confirmedChannels);
    confirmedChannels.forEach(channel => uniqueChannelIds.add(channel.id));
  }

  channelUpdates = uniqueByLastOccurrence(channelUpdates);
  await ctx.store.upsert(channelUpdates)

  await channelMetrics(Array.from(uniqueChannelIds), ctx);
}

// Helper function to filter out duplicates and keep only the last occurrence based on `id`
const uniqueByLastOccurrence = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Map<string, T>();
  for (const item of items) {
    seen.set(item.id, item); // This will overwrite previous entries with the same id
  }
  return Array.from(seen.values());
};

const processAndUpsertPackets = async <T extends { id: string }>(
  packets: T[],
  ctx: Context,
  hookFunction: (packet: T, ctx: Context) => Promise<any>
): Promise<string[]> => {
  let processedPackets = await Promise.all(packets.map(packet => hookFunction(packet, ctx)));
  processedPackets = processedPackets.filter((packet): packet is T => packet !== null);
  processedPackets = uniqueByLastOccurrence(processedPackets);
  await ctx.store.upsert(processedPackets);

  // Return the unique IDs of processed packets
  return processedPackets.map(packet => packet.id);
};

export async function postBlockPacketHook(ctx: Context, entities: Entities) {
  const uniquePacketIds = new Set<string>();

  let packetUpdates = await processAndUpsertPackets(entities.sendPackets, ctx, sendPacketHook);
  packetUpdates.forEach(id => uniquePacketIds.add(id));

  let sendPacketUpdates = (await Promise.all(entities.sendPackets.map(packet => packetSourceChannelUpdate(packet, ctx))))
    .filter((packet): packet is SendPacket => packet !== null);
  sendPacketUpdates = uniqueByLastOccurrence(sendPacketUpdates);
  await ctx.store.upsert(sendPacketUpdates);

  packetUpdates = await processAndUpsertPackets(entities.recvPackets, ctx, recvPacketHook);
  packetUpdates.forEach(id => uniquePacketIds.add(id));

  packetUpdates = await processAndUpsertPackets(entities.writeAckPackets, ctx, writeAckPacketHook);
  packetUpdates.forEach(id => uniquePacketIds.add(id));

  packetUpdates = await processAndUpsertPackets(entities.acknowledgements, ctx, ackPacketHook);
  packetUpdates.forEach(id => uniquePacketIds.add(id));

  if (process.env.CALC_PACKET_METRICS === 'true') {
    await packetMetrics(Array.from(uniquePacketIds), ctx);
  }
}

async function upsertNewEntities(ctx: Context, entities: Entities) {
  await ctx.store.upsert(entities.openInitIbcChannels);
  await ctx.store.upsert(entities.openTryIbcChannels);
  await ctx.store.upsert(entities.openAckIbcChannels);
  await ctx.store.upsert(entities.openConfirmIbcChannels);
  await ctx.store.upsert(entities.closeIbcChannels);
  await ctx.store.upsert(entities.channels);
  await ctx.store.upsert(entities.sendPackets);
  await ctx.store.upsert(entities.writeAckPackets);
  await ctx.store.upsert(entities.recvPackets);
  await ctx.store.upsert(entities.acknowledgements);
  await ctx.store.upsert(entities.timeouts);
  await ctx.store.upsert(entities.writeTimeoutPackets);
  await ctx.store.upsert(entities.sendPacketFees);
  await ctx.store.upsert(entities.openChannelFees);
}
