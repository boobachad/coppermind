import { useState } from 'react';
import { BookOpen, Tag } from 'lucide-react';
import { ProblemSetBrowser } from './ProblemSetBrowser';
import { ProblemSetView } from './ProblemSetView';

export default function CategoryBrowser() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  if (selectedCategoryId) {
    return (
      <ProblemSetView
        itemId={selectedCategoryId}
        getItemCommand="get_category_by_id"
        itemParamName="categoryId"
        getProblemsCommand="get_category_problems"
        problemsParamName="categoryId"
        getStatsCommand="get_category_stats"
        statsParamName="categoryId"
        backButtonText="Back to Categories"
        onBack={() => setSelectedCategoryId(null)}
        headerIcon={<Tag size={24} style={{ color: 'var(--color-accent-primary)' }} />}
        showDifficulty={false}
        showStatusColumn={false}
      />
    );
  }

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
      onItemClick={(item) => setSelectedCategoryId(item.id)}
      showScanButton={false}
      showDifficultyBadge={false}
    />
  );
}
