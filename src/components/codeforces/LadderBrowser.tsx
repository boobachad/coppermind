import { useNavigate } from 'react-router-dom';
import { List } from 'lucide-react';
import { ProblemSetBrowser } from './ProblemSetBrowser';

export function LadderBrowser() {
  const navigate = useNavigate();

  return (
    <ProblemSetBrowser
      title="Codeforces Ladders"
      subtitle="Practice problems organised by difficulty"
      icon={<List size={28} />}
      emptyStateTitle="No Ladders Yet"
      emptyStateDescription="Import an A2OJ-style ladder HTML file to get started."
      getItemsCommand="get_ladders"
      getStatsCommand="get_ladder_stats"
      statsParamName="ladderId"
      importCommand="import_ladder_from_html"
      importRequestBuilder={(html) => ({ htmlContent: html, source: 'A2OJ' })}
      importSuccessMessage="Ladder imported successfully"
      onItemClick={(item) => navigate(`/cf/ladders/${item.id}`)}
      showScanButton={true}
      scanCommand="scan_and_import_public_data"
      showDifficultyBadge={true}
    />
  );
}
