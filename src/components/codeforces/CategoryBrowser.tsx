import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { ProblemSetBrowser } from './ProblemSetBrowser';

export default function CategoryBrowser() {
  const navigate = useNavigate();

  return (
    <ProblemSetBrowser
      title="Problem Categories"
      subtitle="Practice by topic: DP, Graphs, Trees, and more"
      icon={<BookOpen size={28} />}
      emptyStateTitle="No Categories Yet"
      emptyStateDescription="Import an A2OJ-style category HTML file to start practising by topic."
      getItemsCommand="get_categories"
      getStatsCommand="get_category_stats"
      statsParamName="categoryId"
      importCommand="import_category_from_html"
      importRequestBuilder={(html) => ({ htmlContent: html, categoryName: null })}
      importSuccessMessage="Category imported successfully"
      onItemClick={(item) => navigate(`/cf/categories/${item.id}`)}
      showScanButton={false}
      showDifficultyBadge={false}
    />
  );
}
