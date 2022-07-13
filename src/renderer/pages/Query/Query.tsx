import electron from "electron";
import React from "react";
import SplitterLayout from "react-splitter-layout";
import QuerySharing from "../../../lib/QuerySharing";
import { store, QueryState } from "./QueryStore";
import Action from "./QueryAction";
import Container from "../../flux/Container";
import QueryList from "../../components/QueryList";
import QueryHeader from "../../components/QueryHeader";
import QueryEditor from "../../components/QueryEditor";
import QueryResult from "../../components/QueryResult";
import { QueryType } from "../../../lib/Database/Query";
import { DataSourceType } from "../DataSource/DataSourceStore";
import DataSource from "../../../lib/DataSource";

class Query extends React.Component<unknown, QueryState> {
  override componentDidMount(): void {
    Action.initialize();
  }

  handleAddQuery(): void {
    const defaultDataSourceId = this.state.setting.defaultDataSourceId;
    const ds = defaultDataSourceId !== null ? this.findDataSourceById(defaultDataSourceId) : this.state.dataSources[0];
    if (ds) {
      Action.addNewQuery({ dataSourceId: ds.id });
    } else {
      alert("Please create data source");
    }
  }

  findDataSourceById(id: number): DataSourceType | undefined {
    return this.state.dataSources.find((ds) => ds.id === id);
  }

  async handleExecute(query: QueryType): Promise<void> {
    const line = this.state.editor.line ?? 0;
    const dataSource = this.findDataSourceById(query.dataSourceId);
    if (dataSource) {
      await Action.executeQuery({ query, dataSource, line });
    } else {
      alert("DataSource is missing");
    }
  }

  async handleCancel(query: QueryType): Promise<void> {
    if (query.status === "working") {
      await Action.cancelQuery(query);
    }
  }

  async handleShareOnGist(query: QueryType): Promise<void> {
    const chart = this.state.charts.find((chart) => chart.queryId === query.id);
    const setting = this.state.setting.github;
    const dataSource = this.state.dataSources.find((ds) => ds.id === query.dataSourceId);

    if (!setting.token) {
      alert("Set your Github token");
      return;
    }
    if (!dataSource) {
      alert("DataSource is not selected");
      return;
    }

    try {
      await QuerySharing.shareOnGist({ query, chart, setting, dataSource });
    } catch (err) {
      alert(err.message);
    }
  }

  async handleShareOnBdashServer(query: QueryType): Promise<void> {
    const chart = this.state.charts.find((chart) => chart.queryId === query.id);
    const setting = this.state.setting.bdashServer;
    const dataSource = this.state.dataSources.find((ds) => ds.id === query.dataSourceId);

    if (!setting.token) {
      alert("Set your Bdash Server's access token");
      return;
    }
    if (!dataSource) {
      alert("DataSource is not selected");
      return;
    }

    let overwrite: { idHash: string } | undefined = undefined;
    if (query.bdashServerQueryId) {
      const response = electron.ipcRenderer.sendSync("showUpdateQueryDialog");
      if (response === "cancel") return;
      if (response === "update") {
        overwrite = { idHash: query.bdashServerQueryId };
      }
    }

    try {
      const { id: bdashServerQueryId, html_url } = await QuerySharing.shareOnBdashServer({ query, chart, setting, dataSource, overwrite });
      await electron.shell.openExternal(html_url);
      if (bdashServerQueryId) {
        await Action.updateQuery(query.id, { bdashServerQueryId });
      }
    } catch (err) {
      alert(err.message);
    }
  }

  renderMain(): React.ReactNode {
    const query = this.state.queries.find((query) => query.id === this.state.selectedQueryId);
    if (!query) return <div className="page-Query-main" />;
    const dataSource = this.state.dataSources.find((dataSource) => dataSource.id === query.dataSourceId);
    const dataSourceDef = dataSource ? DataSource.get(dataSource.type) : null;

    return (
      <div className="page-Query-main">
        <QueryHeader
          query={query}
          {...this.state}
          onChangeTitle={(title): void => {
            Action.updateQuery(query.id, { title });
          }}
          onChangeDataSource={(dataSourceId): void => {
            Action.updateQuery(query.id, { dataSourceId });
          }}
        />
        <SplitterLayout
          vertical={true}
          primaryIndex={1}
          primaryMinSize={100}
          secondaryMinSize={100}
          customClassName="page-Query-splitter-layout"
        >
          <QueryEditor
            query={query}
            tables={dataSource?.tables ?? []}
            mimeType={dataSource?.mimeType ?? "text/x-sql"}
            formatType={dataSourceDef?.formatType ?? "sql"}
            {...this.state}
            onChangeQueryBody={(body, codeMirrorHistory): void => {
              Action.updateQuery(query.id, { body, codeMirrorHistory: codeMirrorHistory });
            }}
            onChangeCursorPosition={(line): void => Action.updateEditor({ line })}
            onExecute={(): void => {
              this.handleExecute(query);
            }}
            onCancel={(): void => {
              this.handleCancel(query);
            }}
          />
          <QueryResult
            query={query}
            {...this.state}
            onClickCopyAsJson={(): void => {
              QuerySharing.copyAsJson(query);
            }}
            onClickCopyAsTsv={(): void => {
              QuerySharing.copyAsTsv(query);
            }}
            onClickCopyAsCsv={(): void => {
              QuerySharing.copyAsCsv(query);
            }}
            onClickCopyAsMarkdown={(): void => QuerySharing.copyAsMarkdown(query)}
            onClickShareOnGist={(): void => {
              this.handleShareOnGist(query);
            }}
            onClickShareOnBdashServer={(): void => {
              this.handleShareOnBdashServer(query);
            }}
            onSelectTab={(name): void => {
              Action.selectResultTab(query, name);
            }}
            onUpdateChart={Action.updateChart}
          />
        </SplitterLayout>
      </div>
    );
  }

  override render(): React.ReactNode {
    return (
      <div className="page-Query">
        <div className="page-Query-list">
          <QueryList
            {...this.state}
            onAddQuery={(): void => {
              this.handleAddQuery();
            }}
            onSelectQuery={Action.selectQuery}
            onDuplicateQuery={Action.duplicateQuery}
            onDeleteQuery={Action.deleteQuery}
          />
        </div>
        {this.renderMain()}
      </div>
    );
  }
}

export default Container.create<QueryState>(Query, store);
