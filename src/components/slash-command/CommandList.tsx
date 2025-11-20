import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { CommandItemProps } from './items';

export default forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command(item);
    }
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((selectedIndex + 1) % props.items.length);
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="bg-white dark:bg-dark-surface text-black dark:text-dark-text-primary rounded-lg shadow-md border border-stone-200 dark:border-dark-border outline-none overflow-y-auto max-h-[300px] w-60 py-2 z-50">
      {props.items.length ? (
        props.items.map((item: CommandItemProps, index: number) => (
          <button
            key={index}
            className={`flex items-center gap-2 w-full px-4 py-2 text-sm text-left outline-none hover:bg-gray-100 dark:hover:bg-dark-border text-black dark:text-dark-text-primary ${
              index === selectedIndex ? 'bg-gray-100 dark:bg-dark-border' : ''
            }`}
            onClick={() => selectItem(index)}
          >
            <item.icon className="w-4 h-4 text-gray-600 dark:text-dark-text-secondary" />
            <span className="text-black dark:text-dark-text-primary">{item.title}</span>
          </button>
        ))
      ) : (
        <div className="px-4 py-2 text-sm text-gray-500 dark:text-dark-text-muted">No results</div>
      )}
    </div>
  );
});
