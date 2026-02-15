import { ActivityHeatmap } from '../../pos/components/ActivityHeatmap';

export function HeatmapTile() {
    return (
        <div className="col-span-1 md:col-span-12 material-panel p-4 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-lg font-medium text-(--text-primary)">Activity Log</h3>
            </div>
            <div className="flex-1 w-full flex items-center justify-center overflow-x-auto custom-scrollbar">
                <div className="w-full max-w-full">
                    <ActivityHeatmap />
                </div>
            </div>
        </div>
    );
}
