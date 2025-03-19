// File: components/DatabaseSummary.tsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface SummaryData {
  totalCrops: number;
  colorCounts: Record<string, number>;
  materialCounts: Record<string, number>;
  brandCounts: Record<string, number>;
  shapeCounts: Record<string, number>;
//   robotCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  modifierCounts: Record<string, number>;
}

interface Category {
  name: string;
  data: Record<string, number>;
  total: number;
}

// Robots to exclude (front-end filter)
const EXCLUDE_ROBOTS = ['GEM-003', 'GEM-004', 'GEM-007', 'SCN-001', 'SCN-033', 'TST-001'];

const DatabaseSummary: React.FC = () => {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryIndex, setActiveCategoryIndex] = useState<number>(0);

  useEffect(() => {
    axios.get('/api/summary')
      .then(response => {
        setSummary(response.data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching summary:', error);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (summary) {
      // Build categories array (excluding statusCounts)
      const catNames: { [key: string]: string } = {
        brandCounts: 'Brands',
        materialCounts: 'Materials',
        colorCounts: 'Colors',
        shapeCounts: 'Form Factors',
        // robotCounts: 'Robots',
        modifierCounts: 'Modifiers',
      };

      const catArray: Category[] = Object.keys(catNames).map((key) => {
        const data = (summary as any)[key] as Record<string, number>;
        const total = Object.values(data).reduce((sum, val) => sum + val, 0);
        return { name: catNames[key], data, total };
      });

      // Sort categories by total count descending
      catArray.sort((a, b) => b.total - a.total);
      setCategories(catArray);
      setActiveCategoryIndex(0);
    }
  }, [summary]);

  const handlePrev = () => {
    setActiveCategoryIndex(prev => (prev === 0 ? categories.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setActiveCategoryIndex(prev => (prev === categories.length - 1 ? 0 : prev + 1));
  };

  // Outer container uses w-full so that it takes the parent's full width.
  // It is assumed that the parent container (in page.tsx) is the same as used for the search form.
  if (loading) {
    return (
      <div className="w-full relative">
        <div className="w-full h-[320px] bg-white rounded shadow-md flex items-center justify-center">
          <span className="text-gray-500 text-sm">Loading summary...</span>
        </div>
      </div>
    );
  }

  if (!summary || categories.length === 0) {
    return (
      <div className="w-full relative">
        <div className="w-full h-[320px] bg-white rounded shadow-md flex items-center justify-center">
          <span className="text-gray-500 text-sm">No summary data available.</span>
        </div>
      </div>
    );
  }

  const activeCategory = categories[activeCategoryIndex];
  // Sort entries descending by count
  const sortedEntries = Object.entries(activeCategory.data).sort(
    ([, countA], [, countB]) => countB - countA
  );
  // Filter out excluded robots if category = "Robots"
  const displayedEntries =
    activeCategory.name === 'Robots'
      ? sortedEntries.filter(([robot]) => !EXCLUDE_ROBOTS.includes(robot))
      : sortedEntries;

  return (
    <div className="w-full relative">
      {/* Left arrow outside the summary box */}
      <div className="absolute left-[-2.5rem] top-1/2 transform -translate-y-1/2">
        <button onClick={handlePrev} className="text-gray-500 hover:text-gray-700 focus:outline-none">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none"
            viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Summary box */}
      <div className="bg-white rounded shadow-md h-[320px] w-full">
        <div className="px-4 py-3 h-full overflow-y-auto">
          {/* Header: Total Crops and active category name */}
          <div className="mb-2">
            <p className="text-xs text-gray-500 mb-2">
              Total Crops: {summary.totalCrops.toLocaleString()}
            </p>
            <h3 className="text-sm font-semibold text-gray-600">
              {activeCategory.name}
            </h3>
          </div>
          {/* List */}
          <ul className="text-sm text-gray-700 space-y-1">
            {displayedEntries.map(([item, count]) => (
              <li key={item} className="flex justify-between border-b border-gray-100 pb-1">
                <span>{item}</span>
                <span>{count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right arrow outside the summary box */}
      <div className="absolute right-[-2.5rem] top-1/2 transform -translate-y-1/2">
        <button onClick={handleNext} className="text-gray-500 hover:text-gray-700 focus:outline-none">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none"
            viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default DatabaseSummary;
