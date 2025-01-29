import React from 'react';

interface FilterPanelProps {
  materialOptions: string[];
  brandOptions: string[];
  shapeOptions: string[];
  colorOptions: string[];
  labelerOptions: string[];
  selectedMaterial: string;
  selectedBrand: string;
  selectedShape: string;
  selectedColor: string;
  selectedLabeler: string;
  onMaterialChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onShapeChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onLabelerChange: (value: string) => void;
  onClearFilters: () => void; // Must reset states in the parent
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  materialOptions,
  brandOptions,
  shapeOptions,
  colorOptions,
  labelerOptions,
  selectedMaterial,
  selectedBrand,
  selectedShape,
  selectedColor,
  selectedLabeler,
  onMaterialChange,
  onBrandChange,
  onShapeChange,
  onColorChange,
  onLabelerChange,
  onClearFilters,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-4 mt-4 mb-6">

      {/* MATERIAL */}
      <div className="flex flex-col">
        <label
          htmlFor="filter-material"
          className="text-sm font-medium text-gray-600 mb-1"
        >
          Material
        </label>
        <select
          id="filter-material"
          value={selectedMaterial}
          onChange={(e) => onMaterialChange(e.target.value)}
          className="block w-36 border border-gray-300 rounded-md px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
        >
          <option value="">All</option>
          {materialOptions.map((mat) => (
            <option key={mat} value={mat}>{mat}</option>
          ))}
        </select>
      </div>

      {/* BRAND */}
      <div className="flex flex-col">
        <label
          htmlFor="filter-brand"
          className="text-sm font-medium text-gray-600 mb-1"
        >
          Brand
        </label>
        <select
          id="filter-brand"
          value={selectedBrand}
          onChange={(e) => onBrandChange(e.target.value)}
          className="block w-36 border border-gray-300 rounded-md px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
        >
          <option value="">All</option>
          {brandOptions.map((brand) => (
            <option key={brand} value={brand}>{brand}</option>
          ))}
        </select>
      </div>

      {/* SHAPE */}
      <div className="flex flex-col">
        <label
          htmlFor="filter-shape"
          className="text-sm font-medium text-gray-600 mb-1"
        >
          Shape
        </label>
        <select
          id="filter-shape"
          value={selectedShape}
          onChange={(e) => onShapeChange(e.target.value)}
          className="block w-36 border border-gray-300 rounded-md px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
        >
          <option value="">All</option>
          {shapeOptions.map((shape) => (
            <option key={shape} value={shape}>{shape}</option>
          ))}
        </select>
      </div>

      {/* COLOR */}
      <div className="flex flex-col">
        <label
          htmlFor="filter-color"
          className="text-sm font-medium text-gray-600 mb-1"
        >
          Color
        </label>
        <select
          id="filter-color"
          value={selectedColor}
          onChange={(e) => onColorChange(e.target.value)}
          className="block w-36 border border-gray-300 rounded-md px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
        >
          <option value="">All</option>
          {colorOptions.map((col) => (
            <option key={col} value={col}>{col}</option>
          ))}
        </select>
      </div>

      {/* LABELER */}
      <div className="flex flex-col">
        <label
          htmlFor="filter-labeler"
          className="text-sm font-medium text-gray-600 mb-1"
        >
          Labeler
        </label>
        <select
          id="filter-labeler"
          value={selectedLabeler}
          onChange={(e) => onLabelerChange(e.target.value)}
          className="block w-36 border border-gray-300 rounded-md px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
        >
          <option value="">All</option>
          {labelerOptions.map((lb) => (
            <option key={lb} value={lb}>{lb}</option>
          ))}
        </select>
      </div>

      {/* CLEAR ALL BUTTON */}
      <button
        onClick={onClearFilters}
        className="h-8 px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded-md self-end"
      >
        Clear Filters
      </button>
    </div>
  );
};

export default FilterPanel;
