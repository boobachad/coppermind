import { NapchartData, NapchartElement } from '../types';
import type { Activity } from '@/pos/lib/types';
import { getActivityColor } from '@/pos/lib/config';

// Convert CSS variable to computed color
function getCssVariableValue(cssVar: string): string {
  if (!cssVar.startsWith('var(')) return cssVar;
  
  const varName = cssVar.slice(4, -1).trim();
  const computed = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return computed || '#808080'; // Fallback gray
}

function timeStringToMinutes(isoString: string): number {
  const date = new Date(isoString);
  return date.getHours() * 60 + date.getMinutes();
}

export function activitiesToNapchart(activities: Activity[]): NapchartData {
  // Sort activities by start time
  const sorted = [...activities].sort((a, b) => 
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const elements: NapchartElement[] = sorted.map((activity, index) => {
    const start = timeStringToMinutes(activity.startTime);
    const end = timeStringToMinutes(activity.endTime);
    
    // Handle activities that cross midnight
    const actualEnd = end < start ? end + 1440 : end;
    
    const cssColor = getActivityColor(activity.category);
    const hexColor = getCssVariableValue(cssColor);
    
    return {
      id: index,
      start,
      end: actualEnd,
      text: activity.title || activity.category,
      color: hexColor,
      lane: 0,
    };
  });

  return {
    elements,
    shape: 'circle',
    lanes: 1,
  };
}
