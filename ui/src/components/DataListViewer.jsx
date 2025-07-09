// ui/src/components/DataListViewer.jsx
import React from 'react';

/**
 * A generic component to display a list of items with configurable actions.
 * @param {string} title - The title for the list section.
 * @param {Array<object>} items - The array of items to display. Each item should have an 'id'.
 * @param {object} itemConfig - Configuration for how to display and interact with items.
 *   - displayField {string}: The key in the item object to display as the main text.
 *   - actions {Array<object>}: Array of action objects.
 *     - label {string}: Button label.
 *     - onClick {function}: (item) => void, handler for button click.
 *     - disabled {boolean | function}: Optional. (item) => boolean, or boolean.
 * @param {string} [emptyMessage="No items to display."] - Message when items array is empty.
 * @param {boolean} [loading=false] - If true, shows a loading message.
 */
const DataListViewer = ({ title, items, itemConfig, emptyMessage = "No items to display.", loading = false }) => {
  if (loading) {
    return (
      <div className="data-list-viewer">
        <h4>{title}</h4>
        <p className="loading-text">Loading {title.toLowerCase()}...</p>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="data-list-viewer">
        <h4>{title}</h4>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="data-list-viewer data-list"> {/* Added data-list for styling consistency */}
      <h4>{title}</h4>
      <ul>
        {items.map(item => (
          <li key={item.id || item[itemConfig.displayField]}> {/* Fallback key if id is missing */}
            <span>{item[itemConfig.displayField]}</span>
            <div>
              {itemConfig.actions && itemConfig.actions.map(action => {
                const isDisabled = typeof action.disabled === 'function' ? action.disabled(item) : action.disabled;
                return (
                    <button
                        key={action.label}
                        onClick={() => action.onClick(item)}
                        disabled={isDisabled}
                        className={action.className || ''} // Optional className for specific button styling
                    >
                    {action.label}
                    </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DataListViewer;
