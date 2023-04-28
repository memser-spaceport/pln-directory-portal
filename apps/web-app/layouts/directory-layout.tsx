import { Navbar } from '../components/layout/navbar/navbar';

export function DirectoryLayout({ children }) {
  // Second children is acutual page element.
  const childrens = children.props.children;
  return (
    <>
      <Navbar
        isUserLoggedIn={childrens?.[1].props.isUserLoggedIn}
        member={childrens?.[1].props.member || {}}
      />
      <main className="min-w-[1272px] pt-20">{children}</main>
    </>
  );
}
