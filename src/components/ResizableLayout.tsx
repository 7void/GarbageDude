import React from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'

interface ResizableLayoutProps {
  children: React.ReactNode | React.ReactNode[]
  direction?: 'horizontal' | 'vertical'
  defaultSizes?: number[]
  minSizes?: number[]
  className?: string
}

export const ResizableLayout: React.FC<ResizableLayoutProps> = ({
  children,
  direction = 'horizontal',
  defaultSizes,
  minSizes,
  className = ''
}) => {
  const childArray = React.Children.toArray(children)
  const panelCount = childArray.length
  const defaultPanelSizes = defaultSizes || Array(panelCount).fill(100 / Math.max(panelCount, 1))
  const minPanelSizes = minSizes || Array(panelCount).fill(10)

  return (
    <PanelGroup direction={direction} className={className} style={{ height: '100%', width: '100%' }}>
      {childArray.map((child, index) => (
        <React.Fragment key={index}>
          <Panel 
            defaultSize={defaultPanelSizes[index]} 
            minSize={minPanelSizes[index]}
            className="panel-container"
          >
            {child}
          </Panel>
          {index < panelCount - 1 && (
            <PanelResizeHandle className={`resize-handle resize-handle-${direction}`}>
              <div className="resize-handle-bar" />
            </PanelResizeHandle>
          )}
        </React.Fragment>
      ))}
    </PanelGroup>
  )
}

interface ResizablePanelProps {
  children: React.ReactNode
  title?: string
  className?: string
  collapsible?: boolean
  onToggle?: (collapsed: boolean) => void
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  title,
  className = '',
  collapsible = false,
  onToggle
}) => {
  const [collapsed, setCollapsed] = React.useState(false)

  const handleToggle = () => {
    const newState = !collapsed
    setCollapsed(newState)
    onToggle?.(newState)
  }

  return (
    <div className={`resizable-panel ${className} ${collapsed ? 'collapsed' : ''}`}>
      {title && (
        <div className="panel-header">
          <h3 className="panel-title">{title}</h3>
          {collapsible && (
            <button 
              onClick={handleToggle}
              className="panel-toggle"
              aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
            >
              <svg 
                className={`panel-toggle-icon ${collapsed ? 'rotated' : ''}`}
                width="16" 
                height="16" 
                viewBox="0 0 16 16" 
                fill="currentColor"
              >
                <path d="M8 12l-4-4h8l-4 4z"/>
              </svg>
            </button>
          )}
        </div>
      )}
      <div className={`panel-content ${collapsed ? 'hidden' : ''}`}>
        {children}
      </div>
    </div>
  )
}