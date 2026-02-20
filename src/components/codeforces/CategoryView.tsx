import { useParams, useNavigate } from 'react-router-dom';
import { Tag } from 'lucide-react';
import { ProblemSetView } from './ProblemSetView';

export default function CategoryView() {
  const { id: categoryId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!categoryId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-error)' }}>
        Category ID not provided
      </div>
    );
  }

  return (
    <ProblemSetView
      itemId={categoryId}
      getItemCommand="get_category_by_id"
      itemParamName="categoryId"
      getProblemsCommand="get_category_problems"
      problemsParamName="categoryId"
      getStatsCommand="get_category_stats"
      statsParamName="categoryId"
      backButtonText="Back to Categories"
      onBack={() => navigate('/cf/categories')}
      headerIcon={<Tag size={24} style={{ color: 'var(--color-accent-primary)' }} />}
      showDifficulty={false}
      showStatusColumn={true}
    />
  );
}
