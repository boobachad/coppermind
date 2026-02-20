import { useParams, useNavigate } from 'react-router-dom';
import { ProblemSetView } from './ProblemSetView';

export default function LadderView() {
  const { id: ladderId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!ladderId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-error)' }}>
        Ladder ID not provided
      </div>
    );
  }

  return (
    <ProblemSetView
      itemId={ladderId}
      getItemCommand="get_ladder_by_id"
      itemParamName="ladderId"
      getProblemsCommand="get_ladder_problems"
      problemsParamName="ladderId"
      getStatsCommand="get_ladder_stats"
      statsParamName="ladderId"
      backButtonText="Back to Ladders"
      onBack={() => navigate('/cf/ladders')}
      showDifficulty={true}
      showStatusColumn={true}
    />
  );
}
