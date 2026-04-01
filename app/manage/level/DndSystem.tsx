'use client'

import React, { useState, useEffect, createContext, useContext } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const DragContext = createContext<any>(null)

export function SortableList({
  items,
  action,
  children,
  className = '',
}: {
  items: { id: string }[]
  action: (orderedIds: string[]) => Promise<any>
  children: React.ReactNode
  className?: string
}) {
  const router = useRouter()
  const [orderedIds, setOrderedIds] = useState(items.map(i => i.id))

  // 监听服务器数据的变化
  useEffect(() => {
    setOrderedIds(items.map(i => i.id))
  }, [items])

  // 只有拖动超过 5px 才触发，防止误触点击事件
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = orderedIds.indexOf(active.id as string)
      const newIndex = orderedIds.indexOf(over.id as string)
      if (oldIndex < 0 || newIndex < 0) return

      const newOrder = arrayMove(orderedIds, oldIndex, newIndex)
      const previousOrder = orderedIds

      // 1. 瞬间乐观更新 UI
      setOrderedIds(newOrder)
      // 2. 后台保存，失败则回滚
      try {
        const result = await action(newOrder)
        if (!result?.success) {
          setOrderedIds(previousOrder)
          return
        }
        router.refresh()
      } catch {
        setOrderedIds(previousOrder)
      }
    }
  }

  // 核心魔法：拦截服务器传来的子组件，在客户端重新排序渲染！
  const childrenArray = React.Children.toArray(children)
  const sortedChildren = orderedIds
    .map(id => childrenArray.find((c: any) => c.props.id === id))
    .filter(Boolean)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}>
      <SortableContext
        items={orderedIds}
        strategy={verticalListSortingStrategy}>
        <div className={className}>{sortedChildren}</div>
      </SortableContext>
    </DndContext>
  )
}

export function SortableItem({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    setActivatorNodeRef,
    isDragging,
  } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative' as const,
  }

  return (
    <DragContext.Provider
      value={{ setActivatorNodeRef, listeners, attributes }}>
      <div
        ref={setNodeRef}
        style={style}
        className={
          isDragging
            ? 'z-50 opacity-90 scale-[1.01] shadow-2xl rounded-2xl'
            : 'z-0'
        }>
        {children}
      </div>
    </DragContext.Provider>
  )
}

export function DragHandle() {
  const context = useContext(DragContext)
  if (!context) return null
  const { setActivatorNodeRef, listeners, attributes } = context
  return (
    <div
      ref={setActivatorNodeRef}
      {...listeners}
      {...attributes}
      className='p-1 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-lg cursor-grab active:cursor-grabbing transition-colors touch-none'
      title='拖拽排序'>
      <svg
        className='w-5 h-5'
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={2}
          d='M4 8h16M4 16h16'
        />
      </svg>
    </div>
  )
}

// 🌟 追加在 DndSystem.tsx 的最底部
export function ActionInterceptor({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={className || 'inline-block'}
      onClick={e => e.preventDefault()}>
      {children}
    </div>
  )
}
