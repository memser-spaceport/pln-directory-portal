
const Search = (props: any) => {
    const onChange = props?.onChange;
  return (
    <>
      <div className="search">
        <input onChange={onChange} className="search__input" placeholder="Search" />
        <button className="search__btn">
          <img src="/assets/images/icons/search-blue.svg" alt="search" />
        </button>
      </div>
      <style jsx>{`
        .search {
          width: 100%;
          background-color: #ffffff;
          display: flex;
          box-shadow: 0px 1px 2px 0px #0f172a29;
          border-radius: 4px;
        }

        .search__input {
          width: 100%;
          padding: 8px 0px 8px 12px;
          border-radius: 4px 0px 0px 4px;
          font-size: 14px;
          font-weight: 500;
          line-height: 24px;
        }

        .search__input:focus {
          outline: none;
        }

        .search__input::placeholder {
          font-size: 14px;
          font-weight: 500;
          line-height: 24px;
          color: #94a3b8;
        }

        .search__btn {
          height: 40px;
          width: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </>
  );
};

export default Search;