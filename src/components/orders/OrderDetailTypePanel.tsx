'use client';

import dynamic from 'next/dynamic';
import {
  isBadgeOrderType,
  isWeddingGiftOrderType,
} from '@/lib/orders';
import OrderTypePanelSkeleton from './OrderTypePanelSkeleton';
import type { OrderDetailTypePanelProps } from './order-detail-types';

const HonourOrderDetail = dynamic(() => import('./order-types/HonourOrderDetail'), {
  loading: () => <OrderTypePanelSkeleton />,
});

const WeddingGiftOrderDetail = dynamic(() => import('./order-types/WeddingGiftOrderDetail'), {
  loading: () => <OrderTypePanelSkeleton />,
});

const NestieeOrderDetail = dynamic(() => import('./order-types/NestieeOrderDetail'), {
  loading: () => <OrderTypePanelSkeleton />,
});

const CupmokaOrderDetail = dynamic(() => import('./order-types/CupmokaOrderDetail'), {
  loading: () => <OrderTypePanelSkeleton />,
});

export default function OrderDetailTypePanel(props: OrderDetailTypePanelProps) {
  const { orderType } = props;

  if (!orderType) {
    return <p className="text-sm text-gray-400">Choose an Order Type to reveal its fields.</p>;
  }

  if (isBadgeOrderType(orderType)) {
    return (
      <HonourOrderDetail
        orderType={orderType}
        honourLines={props.honourLines}
        honourTotals={props.honourTotals}
        honourSuppliers={props.honourSuppliers}
        supplierOptions={props.supplierOptions}
        setSupplierOptions={props.setSupplierOptions}
        commitHonourLines={props.commitHonourLines}
        applyHonourSuppliers={props.applyHonourSuppliers}
        form={props.form}
      />
    );
  }

  if (isWeddingGiftOrderType(orderType)) {
    return (
      <WeddingGiftOrderDetail
        order={props.order}
        weddingGiftTotal={props.weddingGiftTotal}
        birdNestTotals={props.birdNestTotals}
        bigDayPersistedRef={props.bigDayPersistedRef}
        bigDaySavedOnChangeRef={props.bigDaySavedOnChangeRef}
        onOpenConfirmPaste={props.onOpenConfirmPaste}
        syncWeddingGiftDerived={props.syncWeddingGiftDerived}
        syncWeddingGiftTotalAmount={props.syncWeddingGiftTotalAmount}
        form={props.form}
      />
    );
  }

  if (orderType === 'Nestiee 燕窩訂單') {
    return (
      <NestieeOrderDetail
        order={props.order}
        nestieeGiftBoxes={props.nestieeGiftBoxes}
        form={props.form}
      />
    );
  }

  if (orderType === 'Cupmoka') {
    return (
      <CupmokaOrderDetail
        order={props.order}
        commitCupmokaLines={props.commitCupmokaLines}
        form={props.form}
      />
    );
  }

  return null;
}
