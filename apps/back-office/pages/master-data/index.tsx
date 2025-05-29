import Link from 'next/link';
import { ApprovalLayout } from '../../layout/approval-layout';
import { ROUTE_CONSTANTS } from '../../utils/constants';

const masterDataTypes = [
  {
    title: 'Industry Tags',
    description: 'Manage industry tags and categories',
    href: ROUTE_CONSTANTS.INDUSTRY_TAGS,
    icon: '🏭',
  },
  {
    title: 'Skills',
    description: 'Manage skills and competencies',
    href: ROUTE_CONSTANTS.SKILLS,
    icon: '🛠️',
  },
  {
    title: 'Membership Sources',
    description: 'Manage membership source types',
    href: ROUTE_CONSTANTS.MEMBERSHIP_SOURCES,
    icon: '👥',
  },
  {
    title: 'Technologies',
    description: 'Manage technology categories',
    href: ROUTE_CONSTANTS.TECHNOLOGIES,
    icon: '💻',
  },
  {
    title: 'Focus Areas',
    description: 'Manage focus areas and specializations',
    href: ROUTE_CONSTANTS.FOCUS_AREAS,
    icon: '🎯',
  },
];

export default function MasterDataIndex() {
  return (
    <ApprovalLayout>
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Master Data Management</h1>
          <p className="text-gray-600 mt-2">
            Manage master data entities used throughout the Protocol Labs Directory
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {masterDataTypes.map((type) => (
            <Link key={type.href} href={type.href}>
              <a className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all duration-200">
                <div className="flex items-center mb-4">
                  <span className="text-2xl mr-3">{type.icon}</span>
                  <h3 className="text-lg font-semibold text-gray-900">{type.title}</h3>
                </div>
                <p className="text-gray-600 text-sm">{type.description}</p>
              </a>
            </Link>
          ))}
        </div>
      </div>
    </ApprovalLayout>
  );
}