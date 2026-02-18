import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { CommandItemProps } from './items';
import clsx from 'clsx';

interface CommandListProps {
  items: CommandItemProps[];
  command: (item: CommandItemProps) => void;
}

interface CommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const CommandList = forwardRef<CommandListRef, CommandListProps>((props, ref) => {
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
    <div className="material-panel bg-black/90! backdrop-blur-xl text-white rounded-lg shadow-2xl border border-white/10 outline-none overflow-y-auto max-h-[300px] w-60 py-2 z-50">
      {props.items.length ? (
        props.items.map((item: CommandItemProps, index: number) => (
          <button
            key={index}
            className={clsx(
              "flex items-center gap-2 w-full px-4 py-2 text-sm text-left outline-none transition-colors",
              "text-white hover:bg-white/10",
              index === selectedIndex ? 'bg-white/10' : ''
            )}
            onClick={() => selectItem(index)}
          >
            <item.icon className="w-4 h-4 text-white/60" />
            <span className="text-white">{item.title}</span>
          </button>
        ))
      ) : (
        <div className="px-4 py-2 text-sm text-white/40">No results</div>
      )}
    </div>
  );
});

CommandList.displayName = 'CommandList';

export default CommandList;
