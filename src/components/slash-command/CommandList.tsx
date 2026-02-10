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
    <div className="bg-themed-surface text-themed-text-primary rounded-lg shadow-md border border-themed-border outline-none overflow-y-auto max-h-[300px] w-60 py-2 z-50">
      {props.items.length ? (
        props.items.map((item: CommandItemProps, index: number) => (
          <button
            key={index}
            className={`flex items-center gap-2 w-full px-4 py-2 text-sm text-left outline-none hover:bg-themed-bg text-themed-text-primary ${index === selectedIndex ? 'bg-themed-bg' : ''
              }`}
            onClick={() => selectItem(index)}
          >
            <item.icon className="w-4 h-4 text-themed-text-secondary" />
            <span className="text-themed-text-primary">{item.title}</span>
          </button>
        ))
      ) : (
        <div className="px-4 py-2 text-sm text-themed-text-secondary">No results</div>
      )}
    </div>
  );
});
