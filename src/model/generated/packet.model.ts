import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, Index as Index_, OneToOne as OneToOne_, JoinColumn as JoinColumn_, IntColumn as IntColumn_} from '@subsquid/typeorm-store'
import {SendPacket} from './sendPacket.model'
import {RecvPacket} from './recvPacket.model'
import {WriteAckPacket} from './writeAckPacket.model'
import {Acknowledgement} from './acknowledgement.model'
import {PacketStates} from './_packetStates'
import {PacketCatchUpError} from './packetCatchUpError.model'

@Index_(['sendPacket', 'recvPacket', 'writeAckPacket', 'ackPacket'], {unique: true})
@Entity_()
export class Packet {
    constructor(props?: Partial<Packet>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_({unique: true})
    @OneToOne_(() => SendPacket, {nullable: true})
    @JoinColumn_()
    sendPacket!: SendPacket | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => RecvPacket, {nullable: true})
    @JoinColumn_()
    recvPacket!: RecvPacket | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => WriteAckPacket, {nullable: true})
    @JoinColumn_()
    writeAckPacket!: WriteAckPacket | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => Acknowledgement, {nullable: true})
    @JoinColumn_()
    ackPacket!: Acknowledgement | undefined | null

    @Index_()
    @Column_('varchar', {length: 13, nullable: false})
    state!: PacketStates

    @Index_()
    @IntColumn_({nullable: true})
    sendToRecvTime!: number | undefined | null

    @Index_()
    @IntColumn_({nullable: true})
    sendToRecvGas!: number | undefined | null

    @Index_()
    @IntColumn_({nullable: true})
    sendToAckTime!: number | undefined | null

    @Index_()
    @IntColumn_({nullable: true})
    sendToAckGas!: number | undefined | null

    @Index_()
    @IntColumn_({nullable: true})
    sendToRecvPolymerGas!: number | undefined | null

    @Index_()
    @IntColumn_({nullable: true})
    sendToAckPolymerGas!: number | undefined | null

    @Index_({unique: true})
    @OneToOne_(() => PacketCatchUpError, {nullable: true})
    @JoinColumn_()
    catchupError!: PacketCatchUpError | undefined | null
}
